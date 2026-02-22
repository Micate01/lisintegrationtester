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
        const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const qckMsh = `MSH|^~\\&|LIS|LIS|||${date}||QCK^Q02|1|P|2.3.1||||0||ASCII|||`;
        const msa = `MSA|AA|${messageControlId}|Message accepted|||0|`;
        const err = `ERR|0|`;
        const qak = `QAK|SR|NF|`;
        
        const response = `${qckMsh}\r${msa}\r${err}\r${qak}\r`;
        const respBuffer = Buffer.concat([MLLP_START, Buffer.from(response, 'latin1'), MLLP_END]);
        socket.write(respBuffer);
        
        await db.query(
            'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
            [equipmentId, 'QCK^Q02', 'OUT', response]
        );
    }
  } catch (error) {
    console.error('Error handling BS-200 HL7 message:', error);
  }
}
