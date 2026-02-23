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

      const ack = generateBS200ACK(msh, 'AA', '', messageControlId);
      const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(ack, 'latin1'), MLLP_END]);
      socket.write(ackBuffer);

      await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'ACK^R01', 'OUT', ack]
      );
    } else if (messageType === 'QRY' && triggerEvent === 'Q02') {
        const qrd = segments.find(s => s[0] === 'QRD');
        const sampleId = qrd ? (qrd[8] || '') : '';
        
        console.log(`[MindrayAdapter] Query for Sample ID: ${sampleId}`);

        const { rows } = await db.query('SELECT * FROM worklist WHERE sample_barcode = $1 LIMIT 1', [sampleId]);
        const order = rows[0];

        const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const sendingApp = msh[2] || '';
        const sendingFac = msh[3] || '';
        
        // QCK^Q02 Response
        const qckMsh = `MSH|^~\\&|||${sendingApp}|${sendingFac}|${date}||QCK^Q02|${messageControlId}|P|2.3.1||||0||ASCII|||`;
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
            const dsrMsh = `MSH|^~\\&|||${sendingApp}|${sendingFac}|${date}||DSR^Q03|${dsrControlId}|P|2.3.1||||0||ASCII|||`;
            const dsrMsa = `MSA|AA|${messageControlId}|Message accepted|||0|`;
            const dsrErr = `ERR|0|`;
            const dsrQak = `QAK|SR|OK|`;
            const dsrQrd = `QRD|${date}|R|I|${messageControlId}|||1^RD|${sampleId}|OTH|||T|`;
            const dsrQrf = `QRF|BS-200||||0|`;
            
            const pid = order.patient_id || '';
            const name = order.patient_name || '';
            const sex = order.sex || 'M';
            const age = order.age || '';
            
            const dsp1 = `DSP|1||${sampleId}|||`;
            const dsp2 = `DSP|2|||||`;
            const dsp3 = `DSP|3||${pid}^${name}^${sex}^${age}^^^^^^^|||`;
            
            // Assuming test_names is a comma-separated list of tests
            const tests = (order.test_names || '').split(',').map(t => t.trim()).filter(t => t);
            let dspTests = '';
            for (let i = 0; i < tests.length; i++) {
                // Format: DSP|sequence||test_no^^^test_name^^^|||
                // Using index + 4 for sequence number
                dspTests += `DSP|${i + 4}||${i + 1}^^^${tests[i]}^^^|||\r`;
            }
            
            const dsrResponse = `${dsrMsh}\r${dsrMsa}\r${dsrErr}\r${dsrQak}\r${dsrQrd}\r${dsrQrf}\r${dsp1}\r${dsp2}\r${dsp3}\r${dspTests}`;
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
