import net from 'net';
import { getDb } from './db';
import { parseHL7, generateBS200ACK, MLLP_START, MLLP_END } from './hl7-mindray-utils';

export async function handleBS200Message(message: string, socket: net.Socket, equipmentId: number) {
  console.log(`Received BS-200 HL7 message from equipment ${equipmentId}`);
  
  try {
    const db = getDb();
    let segments = parseHL7(message);

    if (segments.length <= 1 && (message.includes('PID|') || message.includes('OBR|') || message.includes('OBX|'))) {
        console.warn('Single segment detected with multiple segment markers. Attempting to split by segment headers.');
        const rawSegments = message.split(/(?=(?:MSH|PID|OBR|OBX|QRD|QRF|DSC)\s*\|)/).filter(s => s.trim() !== '');
        segments = rawSegments.map(s => s.split('|'));
    }

    console.log(`Parsed ${segments.length} segments`);

    const msh = segments.find(s => s[0] === 'MSH');
    
    if (!msh) {
        console.error('No MSH segment found');
        return;
    }

    let typeIndex = msh.findIndex(f => f && (f.startsWith('ORU') || f.startsWith('QRY')));
    if (typeIndex === -1) typeIndex = 8;

    const messageTypeField = msh[typeIndex] || '';
    const messageType = messageTypeField.split('^')[0]; 
    const triggerEvent = messageTypeField.split('^')[1]; 
    
    const messageControlId = msh[typeIndex + 1] || '';
    const msh16 = msh[15] || '0';

    await db.query(
      'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
      [equipmentId, `${messageType}^${triggerEvent}` || 'UNKNOWN', 'IN', message]
    );

    if (messageType === 'ORU') {
      const pid = segments.find(s => s[0] === 'PID');
      const obr = segments.find(s => s[0] === 'OBR');
      const obxSegments = segments.filter(s => s[0] === 'OBX');

      console.log(`Found ${obxSegments.length} OBX segments`);

      const patientName = pid ? pid[5]?.replace(/\^/g, ' ') : '';
      const sampleBarcode = obr ? obr[2] : '';
      const barcodeToUse = sampleBarcode || (obr ? obr[3] : '');

      for (const obx of obxSegments) {
        const testNo = obx[3]?.split('^')[0] || '';
        const testName = obx[3]?.split('^')[1] || '';
        const resultValue = obx[5] || '';
        const resultUnit = obx[6] || '';
        
        let resultTime = new Date();
        if (obx[14]) {
            const t = obx[14];
            if (t.length >= 14) {
                const year = parseInt(t.substring(0, 4));
                const month = parseInt(t.substring(4, 6)) - 1;
                const day = parseInt(t.substring(6, 8));
                const hour = parseInt(t.substring(8, 10));
                const min = parseInt(t.substring(10, 12));
                const sec = parseInt(t.substring(12, 14));
                resultTime = new Date(year, month, day, hour, min, sec);
            }
        }

        if (msh16 === '2') {
            // QC Result
            // Spec Page 27, 31: QC Level is in OBR-17 (H/M/L)
            // QC Lot No is in OBR-14 (Specimen Received Date/Time)
            const qcLevelCode = obr ? (obr[17] || '') : '';
            const qcLot = (obr && obr[14]) ? obr[14] : barcodeToUse;
            
            let qcLevel = 'Unknown';
            if (qcLevelCode === 'H') qcLevel = 'High';
            else if (qcLevelCode === 'M') qcLevel = 'Medium';
            else if (qcLevelCode === 'L') qcLevel = 'Low';
            else {
                // Fallback to lot parsing if OBR-17 is empty/invalid
                if (qcLot.includes('L1') || qcLot.includes('1')) qcLevel = 'Level 1';
                else if (qcLot.includes('L2') || qcLot.includes('2')) qcLevel = 'Level 2';
                else if (qcLot.includes('L3') || qcLot.includes('3')) qcLevel = 'Level 3';
                else qcLevel = 'Level 1';
            }

            const existingQC = await db.query(
                `SELECT id FROM qc_results 
                 WHERE equipment_id = $1 AND qc_lot = $2 AND test_no = $3 AND result_value = $4`,
                [equipmentId, qcLot, testNo, resultValue]
            );

            if (existingQC.rows.length === 0) {
                await db.query(
                    `INSERT INTO qc_results (equipment_id, qc_level, qc_lot, test_no, test_name, result_value, result_unit, result_time)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [equipmentId, qcLevel, qcLot, testNo, testName, resultValue, resultUnit, resultTime]
                );
            } else {
                console.log(`Duplicate QC result skipped: ${qcLot} - ${testNo}`);
                await db.query(
                    'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                    [equipmentId, 'DUPLICATE', 'INFO', `Duplicate QC result skipped: ${qcLot} - ${testNo} (${testName})`]
                );
            }
        } else {
            // Standard Sample Result
            const existing = await db.query(
              `SELECT id FROM results 
               WHERE equipment_id = $1 AND sample_barcode = $2 AND test_no = $3 AND result_value = $4`,
              [equipmentId, barcodeToUse, testNo, resultValue]
            );

            if (existing.rows.length === 0) {
              await db.query(
                `INSERT INTO results (equipment_id, sample_barcode, patient_name, test_no, test_name, result_value, result_unit, result_time)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [equipmentId, barcodeToUse, patientName, testNo, testName, resultValue, resultUnit, resultTime]
              );
            } else {
              console.log(`Duplicate result skipped: ${barcodeToUse} - ${testNo}`);
              await db.query(
                'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                [equipmentId, 'DUPLICATE', 'INFO', `Duplicate result skipped: ${barcodeToUse} - ${testNo} (${testName})`]
              );
            }
        }
      }

      const ack = generateBS200ACK(msh, 'AA', '', messageControlId);
      const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(ack, 'latin1'), MLLP_END]);
      socket.write(ackBuffer);

      await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'ACK^R01', 'OUT', ack]
      );
    } else if (messageType === 'QRY' && triggerEvent === 'Q02') {
        const qrd = segments.find(s => s[0] === 'QRD');
        const qrf = segments.find(s => s[0] === 'QRF');
        const sampleId = qrd ? (qrd[8] || '') : '';
        const inboundModel = qrf ? (qrf[1] || 'BS-200') : 'BS-200';
        
        console.log(`[MindrayAdapter] Query for Sample ID: ${sampleId}`);

        const { rows } = await db.query('SELECT * FROM worklist WHERE sample_barcode = $1 LIMIT 1', [sampleId]);
        const order = rows[0];

        const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const sendingApp = msh[2] || '';
        const sendingFac = msh[3] || '';
        
        // QCK^Q02 Response
        const qckMsh = `MSH|^~\\&|||${sendingApp}|${sendingFac}|${date}||QCK^Q02|${messageControlId}|P|2.3.1||||${msh16}||ASCII|||`;
        const msa = `MSA|AA|${messageControlId}|Message accepted|||0|`;
        const err = `ERR|0|`;
        const qakStatus = order ? 'OK' : 'NF';
        const qak = `QAK|SR|${qakStatus}|`;
        
        const qckResponse = `${qckMsh}\r${msa}\r${err}\r${qak}\r`;
        const qckBuffer = Buffer.concat([MLLP_START, Buffer.from(qckResponse, 'latin1'), MLLP_END]);
        socket.write(qckBuffer);
        
        await db.query(
            'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
            [equipmentId, 'QCK^Q02', 'OUT', qckResponse]
        );

        // If order found, send DSR^Q03
        if (order) {
            const dsrControlId = Date.now().toString().slice(-10);
            const dsrMsh = `MSH|^~\\&|||${sendingApp}|${sendingFac}|${date}||DSR^Q03|${dsrControlId}|P|2.3.1||||${msh16}||ASCII|||`;
            const dsrMsa = `MSA|AA|${messageControlId}|Message accepted|||0|`;
            const dsrErr = `ERR|0|`;
            const dsrQak = `QAK|SR|OK|`;
            const dsrQrd = `QRD|${date}|R|D|${messageControlId}|||1^RD|${sampleId}|OTH|||T|`;
            const dsrQrf = `QRF|${inboundModel}||||0|`;
            
            const pid = order.patient_id || '';
            const name = order.patient_name || '';
            const sex = order.sex || 'M';
            const age = order.age || '';
            const admissionNumber = order.admission_number || pid;
            const bedNumber = order.bed_number || '';
            const birthDate = order.birth_date || '';
            const bloodType = order.blood_type || '';
            const orderSampleId = order.sample_id || '';
            const sampleTime = order.sample_time || date;
            const statFlag = order.stat_flag || 'N';
            const sampleType = order.sample_type || '';
            const fetchDoctor = order.fetch_doctor || '';
            const fetchDepartment = order.fetch_department || '';
            
            const dsp1 = `DSP|1||${admissionNumber}|||`; // Patient ID/Admission No
            const dsp2 = `DSP|2||${bedNumber}|||`; // Bed No
            const dsp3 = `DSP|3||${name}|||`; // Patient Name
            const dsp4 = `DSP|4||${birthDate}|||`; // Birth Date
            const dsp5 = `DSP|5||${sex}|||`; // Sex
            const dsp6 = `DSP|6||${bloodType}|||`; // Blood Type
            const dsp7 = `DSP|7|||||`; // Patient Type
            const dsp8 = `DSP|8|||||`; // Address
            const dsp9 = `DSP|9|||||`; // Zip Code
            const dsp10 = `DSP|10|||||`; // Phone
            const dsp11 = `DSP|11|||||`; // Diagnostic Info
            const dsp12 = `DSP|12|||||`; // Charge Type
            const dsp13 = `DSP|13|||||`; // Charge Amount
            const dsp14 = `DSP|14|||||`; // Charge Status
            const dsp15 = `DSP|15|||||`; // In-patient No
            const dsp16 = `DSP|16|||||`; // Out-patient No
            const dsp17 = `DSP|17|||||`; // Ward
            const dsp18 = `DSP|18|||||`; // Department
            const dsp19 = `DSP|19|||||`; // Doctor
            const dsp20 = `DSP|20|||||`; // Sender
            const dsp21 = `DSP|21||${sampleId}|||`; // Bar Code
            const dsp22 = `DSP|22||${orderSampleId}|||`; // Sample ID (Analyzer specific)
            const dsp23 = `DSP|23||${sampleTime}|||`; // Sample Time
            const dsp24 = `DSP|24||${statFlag}|||`; // STAT
            const dsp25 = `DSP|25|||||`; // Sample Status
            const dsp26 = `DSP|26||${sampleType}|||`; // Sample Type
            const dsp27 = `DSP|27||${fetchDoctor}|||`; // Fetch Doctor
            const dsp28 = `DSP|28||${fetchDepartment}|||`; // Fetch Department
            
            const dspBase = [dsp1, dsp2, dsp3, dsp4, dsp5, dsp6, dsp7, dsp8, dsp9, dsp10, dsp11, dsp12, dsp13, dsp14, dsp15, dsp16, dsp17, dsp18, dsp19, dsp20, dsp21, dsp22, dsp23, dsp24, dsp25, dsp26, dsp27, dsp28].join('\r') + '\r';
            
            // Assuming test_names is a comma-separated list of tests
            // Format can be "TestName" or "TestName|Unit|NormalRange"
            const tests = (order.test_names || '').split(',').map(t => t.trim()).filter(t => t);
            let dspTests = '';
            for (let i = 0; i < tests.length; i++) {
                const testParts = tests[i].split('|');
                const tName = testParts[0] || '';
                const tUnit = testParts[1] || '';
                const tRange = testParts[2] || '';
                
                // Format: DSP|sequence||Test Number^Test Name^Unit^Normal Range|||
                // Using index + 29 for sequence number
                dspTests += `DSP|${i + 29}||${i + 1}^${tName}^${tUnit}^${tRange}|||\r`;
            }
            
            const dsc = `DSC||\r`;
            
            const dsrResponse = `${dsrMsh}\r${dsrMsa}\r${dsrErr}\r${dsrQak}\r${dsrQrd}\r${dsrQrf}\r${dspBase}${dspTests}${dsc}`;
            const dsrBuffer = Buffer.concat([MLLP_START, Buffer.from(dsrResponse, 'latin1'), MLLP_END]);
            
            // Small delay before sending DSR
            setTimeout(async () => {
                socket.write(dsrBuffer);
                await db.query(
                    'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                    [equipmentId, 'DSR^Q03', 'OUT', dsrResponse]
                );
            }, 500);
        }
    } else if (messageType === 'ACK' && triggerEvent === 'Q03') {
        console.log(`[MindrayAdapter] Received ACK^Q03 for DSR message. Control ID: ${messageControlId}`);
    }
  } catch (error: any) {
    console.error('Error handling BS-200 HL7 message:', error);
    try {
        const db = getDb();
        const msh = parseHL7(message).find(s => s[0] === 'MSH');
        if (msh) {
            const messageControlId = msh[9] || '1';
            const ack = generateBS200ACK(msh, 'AE', error.message || 'Internal Error', messageControlId);
            const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(ack, 'latin1'), MLLP_END]);
            socket.write(ackBuffer);
            await db.query(
                'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                [equipmentId, 'ACK^R01', 'OUT', ack]
            );
        }
    } catch (e) {
        console.error('Failed to send error ACK:', e);
    }
  }
}
