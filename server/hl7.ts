import net from 'net';
import { getDb } from './db';

const MLLP_START = Buffer.from([0x0b]);
const MLLP_END = Buffer.from([0x1c, 0x0d]);

export function parseHL7(message: string) {
  const segments = message.split('\r').filter(s => s.trim() !== '');
  return segments.map(segment => segment.split('|'));
}

export function generateACK(originalMsh: string[], ackCode: string, errorMsg: string = '') {
  const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const msh = `MSH|^~\\&|LIS|LIS|||${date}||ACK^R01|1|P|2.3.1||||0||ASCII|||`;
  const msa = `MSA|${ackCode}|${originalMsh[9] || ''}|${errorMsg}|||0|`;
  return `${msh}\r${msa}\r`;
}

export function startAdapter(port: number, equipmentId: number) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      let startIndex = buffer.indexOf(MLLP_START);
      let endIndex = buffer.indexOf(MLLP_END);

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const payload = buffer.subarray(startIndex + 1, endIndex);
        const hl7Message = payload.toString('latin1');
        
        await handleHL7Message(hl7Message, socket, equipmentId);

        buffer = buffer.subarray(endIndex + 2);
        startIndex = buffer.indexOf(MLLP_START);
        endIndex = buffer.indexOf(MLLP_END);
      }
    });

    socket.on('error', (err) => {
      console.error(`Adapter ${equipmentId} socket error:`, err);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Adapter for equipment ${equipmentId} listening on port ${port}`);
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

    // Log the incoming message
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
        const resultTime = new Date(); // In a real scenario, parse from OBX[14] if available

        await db.query(
          `INSERT INTO results (equipment_id, sample_barcode, patient_name, test_no, test_name, result_value, result_unit, result_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [equipmentId, sampleBarcode, patientName, testNo, testName, resultValue, resultUnit, resultTime]
        );
      }

      // Send ACK
      const ack = generateACK(msh, 'AA');
      const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(ack, 'latin1'), MLLP_END]);
      socket.write(ackBuffer);

      // Log the outgoing ACK
      await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'ACK', 'OUT', ack]
      );
    }
  } catch (error) {
    console.error('Error handling HL7 message:', error);
    // If DB is not configured, we just log and ignore
  }
}
