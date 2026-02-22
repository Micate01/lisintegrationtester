import net from 'net';
import { getDb } from './db';
import { MLLP_START, MLLP_END, parseHL7, generateACK } from './hl7-utils';
import { startMindrayBS200Adapter } from './adapters/mindrayBS200Adapter';
import { handleMedconnMessage } from './adapters/medconnAdapter';

export { MLLP_START, MLLP_END, parseHL7, generateACK };

const activeAdapters = new Map<number, net.Server>();

export function startAdapter(port: number, equipmentId: number, model: string) {
  // Stop existing adapter if running
  stopAdapter(equipmentId);

  // Check for specific adapter
  if (model && (model.toLowerCase().includes('bs-200') || model.toLowerCase().includes('bs200'))) {
    console.log(`Starting Mindray BS-200 adapter for equipment ${equipmentId}`);
    const server = startMindrayBS200Adapter(port, equipmentId);
    activeAdapters.set(equipmentId, server);
    return server;
  }

  const server = net.createServer((socket) => {
    const isMedconn = model && model.toLowerCase().includes('medconn');
    
    if (isMedconn) {
        console.log(`[Medconn] Client connected to equipment ${equipmentId} (Port ${port})`);
    } else {
        console.log(`Client connected to adapter ${equipmentId} (Port ${port})`);
    }

    // Update status to connected
    getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['connected', equipmentId])
      .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));

    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      console.log(`[Adapter ${equipmentId}] Received ${data.length} bytes:`, data.toString('hex'));
      buffer = Buffer.concat([buffer, data]);
      
      let startIndex = buffer.indexOf(MLLP_START);
      let endIndex = buffer.indexOf(MLLP_END);
      
      console.log(`[Adapter ${equipmentId}] Buffer search - Start: ${startIndex}, End: ${endIndex}, Buffer len: ${buffer.length}`);

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const payload = buffer.subarray(startIndex + 1, endIndex);
        // Use UTF-8 for Medconn as per spec, latin1 for others/default
        const encoding = (model && model.toLowerCase().includes('medconn')) ? 'utf8' : 'latin1';
        const hl7Message = payload.toString(encoding);
        
        console.log(`[Adapter ${equipmentId}] Processing message (${encoding}):`, hl7Message.substring(0, 50) + '...');

        if (model && model.toLowerCase().includes('medconn')) {
            await handleMedconnMessage(hl7Message, socket, equipmentId);
        } else {
            await handleHL7Message(hl7Message, socket, equipmentId);
        }

        buffer = buffer.subarray(endIndex + MLLP_END.length);
        startIndex = buffer.indexOf(MLLP_START);
        endIndex = buffer.indexOf(MLLP_END);
      }
    });

    socket.on('close', () => {
        if (isMedconn) {
            console.log(`[Medconn] Client disconnected from equipment ${equipmentId}`);
        } else {
            console.log(`Client disconnected from adapter ${equipmentId}`);
        }
        
        // Update status to disconnected
        getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['disconnected', equipmentId])
          .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));
    });

    socket.on('error', (err) => {
      console.error(`Adapter ${equipmentId} socket error:`, err);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Adapter for equipment ${equipmentId} listening on port ${port}`);
  });
  
  activeAdapters.set(equipmentId, server);
  return server;
}

export function stopAdapter(equipmentId: number) {
  const server = activeAdapters.get(equipmentId);
  if (server) {
    server.close(() => {
      console.log(`Adapter for equipment ${equipmentId} stopped`);
    });
    activeAdapters.delete(equipmentId);
  }
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

        // Check for duplicates
        const existing = await db.query(
          `SELECT id FROM results 
           WHERE equipment_id = $1 AND sample_barcode = $2 AND test_no = $3 AND result_time = $4`,
          [equipmentId, sampleBarcode, testNo, resultTime]
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
