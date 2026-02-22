import net from 'net';
import { getDb } from './db';
import { MLLP_START, MLLP_END, parseHL7, generateACK } from './hl7-utils-generic';

export function startGenericAdapter(port: number, equipmentId: number) {
  const server = net.createServer((socket) => {
    console.log(`Client connected to generic adapter ${equipmentId} (Port ${port})`);

    getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['connected', equipmentId])
      .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));

    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      console.log(`[Adapter ${equipmentId}] Received ${data.length} bytes. Hex: ${data.toString('hex')}`);
      console.log(`[Adapter ${equipmentId}] ASCII preview: ${data.toString('latin1').replace(/[\x00-\x1F\x7F]/g, '.')}`);
      
      buffer = Buffer.concat([buffer, data]);
      
      let startIndex = buffer.indexOf(MLLP_START);
      let endIndex = buffer.indexOf(MLLP_END);
      
      if (startIndex === -1 && buffer.length > 0) {
          console.warn(`[Adapter ${equipmentId}] WARNING: Data received but no MLLP Start Block (0x0B) found yet.`);
      }

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const payload = buffer.subarray(startIndex + 1, endIndex);
        const encoding = 'latin1';
        const hl7Message = payload.toString(encoding);
        
        console.log(`[Adapter ${equipmentId}] Processing complete message (${encoding}, ${payload.length} bytes)`);

        try {
            await handleHL7Message(hl7Message, socket, equipmentId);
        } catch (err) {
            console.error(`[Adapter ${equipmentId}] Error processing message:`, err);
        }

        buffer = buffer.subarray(endIndex + MLLP_END.length);
        startIndex = buffer.indexOf(MLLP_START);
        endIndex = buffer.indexOf(MLLP_END);
      }
    });

    socket.on('close', () => {
        console.log(`Client disconnected from generic adapter ${equipmentId}`);
        getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['disconnected', equipmentId])
          .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));
    });

    socket.on('error', (err) => {
      console.error(`Adapter ${equipmentId} socket error:`, err);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Generic Adapter for equipment ${equipmentId} listening on port ${port}`);
  });
  
  return server;
}

async function handleHL7Message(message: string, socket: net.Socket, equipmentId: number) {
  console.log(`Received HL7 message from equipment ${equipmentId}`);
  
  try {
    const db = getDb();
    const segments = parseHL7(message);
    const msh = segments.find(s => s[0] === 'MSH');
    
    if (!msh) return;

    const messageType = msh[8]?.split('^')[0];

    await db.query(
      'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
      [equipmentId, messageType || 'UNKNOWN', 'IN', message]
    );

    if (messageType === 'ORU') {
      const pid = segments.find(s => s[0] === 'PID');
      const obr = segments.find(s => s[0] === 'OBR');
      const obxSegments = segments.filter(s => s[0] === 'OBX');

      const patientName = pid ? pid[5]?.replace(/\^/g, ' ') : '';
      const sampleBarcode = obr ? obr[2] : '';

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
          [equipmentId, sampleBarcode, testNo, resultValue]
        );

        if (existing.rows.length === 0) {
          await db.query(
            `INSERT INTO results (equipment_id, sample_barcode, patient_name, test_no, test_name, result_value, result_unit, result_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [equipmentId, sampleBarcode, patientName, testNo, testName, resultValue, resultUnit, resultTime]
          );
        } else {
          console.log(`Duplicate result skipped: ${sampleBarcode} - ${testNo}`);
          await db.query(
            'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
            [equipmentId, 'DUPLICATE', 'INFO', `Duplicate result skipped: ${sampleBarcode} - ${testNo} (${testName})`]
          );
        }
      }

      const ack = generateACK(msh, 'AA');
      const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(ack, 'latin1'), MLLP_END]);
      socket.write(ackBuffer);

      await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'ACK', 'OUT', ack]
      );
    }
  } catch (error) {
    console.error('Error handling HL7 message:', error);
  }
}
