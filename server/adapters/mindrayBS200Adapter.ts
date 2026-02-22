import net from 'net';
import { getDb } from '../db';
import { MLLP_START, MLLP_END, parseHL7 } from '../hl7';

export function startMindrayBS200Adapter(port: number, equipmentId: number) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      let startIndex = buffer.indexOf(MLLP_START);
      let endIndex = buffer.indexOf(MLLP_END);

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const payload = buffer.subarray(startIndex + 1, endIndex);
        const hl7Message = payload.toString('latin1');
        
        await handleBS200Message(hl7Message, socket, equipmentId);

        buffer = buffer.subarray(endIndex + 2);
        startIndex = buffer.indexOf(MLLP_START);
        endIndex = buffer.indexOf(MLLP_END);
      }
    });

    socket.on('error', (err) => {
      console.error(`BS-200 Adapter ${equipmentId} socket error:`, err);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`BS-200 Adapter for equipment ${equipmentId} listening on port ${port}`);
  });
  
  return server;
}

function generateBS200ACK(originalMsh: string[], ackCode: string, errorMsg: string = '') {
  // BS-200 specific ACK format
  // MSH|^~\&|LIS|LIS|||YYYYMMDDHHMMSS||ACK^R01|1|P|2.3.1||||0||ASCII|||
  // MSA|AA|MessageControlID|Message accepted|||0|
  
  const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const msh = `MSH|^~\\&|LIS|LIS|||${date}||ACK^R01|1|P|2.3.1||||0||ASCII|||`;
  const msa = `MSA|${ackCode}|${originalMsh[9] || ''}|${errorMsg ? errorMsg : 'Message accepted'}|||0|`;
  return `${msh}\r${msa}\r`;
}

async function handleBS200Message(message: string, socket: net.Socket, equipmentId: number) {
  console.log(`Received BS-200 HL7 message from equipment ${equipmentId}`);
  
  try {
    const db = getDb();
    const segments = parseHL7(message);
    const msh = segments.find(s => s[0] === 'MSH');
    
    if (!msh) return;

    const messageType = msh[8]?.split('^')[0]; // ORU
    const triggerEvent = msh[8]?.split('^')[1]; // R01

    // Log the incoming message
    await db.query(
      'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
      [equipmentId, `${messageType}^${triggerEvent}` || 'UNKNOWN', 'IN', message]
    );

    if (messageType === 'ORU' && triggerEvent === 'R01') {
      // Handle Results
      const pid = segments.find(s => s[0] === 'PID');
      const obr = segments.find(s => s[0] === 'OBR');
      const obxSegments = segments.filter(s => s[0] === 'OBX');

      // PID-5: Patient Name
      const patientName = pid ? pid[5]?.replace(/\^/g, ' ') : '';
      
      // OBR-2: Sample Barcode (Placer Order Number)
      // OBR-3: Sample ID (Filler Order Number)
      const sampleBarcode = obr ? obr[2] : '';
      
      // According to doc, OBR-2 is Sample Barcode, OBR-3 is Sample ID
      // If OBR-2 is empty, check OBR-3
      const barcodeToUse = sampleBarcode || (obr ? obr[3] : '');

      for (const obx of obxSegments) {
        // OBX-3: Observation Identifier (Test ID) -> Test No ^ Test Name
        const testNo = obx[3]?.split('^')[0] || '';
        const testName = obx[3]?.split('^')[1] || '';
        
        // OBX-5: Observation Value
        const resultValue = obx[5] || '';
        
        // OBX-6: Units
        const resultUnit = obx[6] || '';
        
        // OBX-14: Date/Time of the Observation
        let resultTime = new Date();
        if (obx[14]) {
            // Parse YYYYMMDDHHMMSS
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

        await db.query(
          `INSERT INTO results (equipment_id, sample_barcode, patient_name, test_no, test_name, result_value, result_unit, result_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [equipmentId, barcodeToUse, patientName, testNo, testName, resultValue, resultUnit, resultTime]
        );
      }

      // Send ACK
      const ack = generateBS200ACK(msh, 'AA');
      const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(ack, 'latin1'), MLLP_END]);
      socket.write(ackBuffer);

      // Log the outgoing ACK
      await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'ACK^R01', 'OUT', ack]
      );
    } else if (messageType === 'QRY' && triggerEvent === 'Q02') {
        // Handle Query for Sample Info
        // For now, we just ACK it, as we don't have a full LIS order system implemented yet
        // But we should log it.
        
        // Send QCK^Q02 (Query Acknowledgment)
        // MSH|^~\&|LIS|LIS|||YYYYMMDDHHMMSS||QCK^Q02|1|P|2.3.1||||0||ASCII|||
        // MSA|AA|MessageControlID|Message accepted|||0|
        // ERR|0|
        // QAK|SR|NF| (No data found for now)
        
        const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const qckMsh = `MSH|^~\\&|LIS|LIS|||${date}||QCK^Q02|1|P|2.3.1||||0||ASCII|||`;
        const msa = `MSA|AA|${msh[9] || ''}|Message accepted|||0|`;
        const err = `ERR|0|`;
        const qak = `QAK|SR|NF|`; // NF = No Data Found, OK = Data Found
        
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
