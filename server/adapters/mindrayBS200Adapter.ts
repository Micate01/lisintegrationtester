import net from 'net';
import { getDb } from '../db';
import { MLLP_START, MLLP_END } from '../hl7-mindray-utils';
import { handleBS200Message } from '../hl7-mindray';

export function startMindrayBS200Adapter(port: number, equipmentId: number) {
  const server = net.createServer((socket) => {
    console.log(`[Mindray BS-200] Client connected to equipment ${equipmentId} (Port ${port})`);

    // Keep connection alive
    socket.setKeepAlive(true, 10000);

    // Update status to connected
    getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['connected', equipmentId])
      .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));

    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      console.log(`[Mindray BS-200 Adapter ${equipmentId}] Received ${data.length} bytes.`);
      buffer = Buffer.concat([buffer, data]);
      
      let startIndex = buffer.indexOf(MLLP_START);
      let endIndex = buffer.indexOf(MLLP_END);

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const payload = buffer.subarray(startIndex + 1, endIndex);
        const hl7Message = payload.toString('latin1');
        
        try {
            await handleBS200Message(hl7Message, socket, equipmentId);
        } catch (err) {
            console.error(`[Mindray BS-200 Adapter ${equipmentId}] Error processing message:`, err);
        }

        buffer = buffer.subarray(endIndex + MLLP_END.length);
        startIndex = buffer.indexOf(MLLP_START);
        endIndex = buffer.indexOf(MLLP_END);
      }
    });

    socket.on('close', () => {
        console.log(`[Mindray BS-200] Client disconnected from equipment ${equipmentId}`);
        // Update status to disconnected
        getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['disconnected', equipmentId])
          .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));
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
