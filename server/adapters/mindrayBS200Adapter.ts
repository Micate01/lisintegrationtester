import net from 'net';
import { getDb } from '../db';
import { MLLP_START, MLLP_END } from '../hl7-mindray-utils';
import { handleBS200Message } from '../hl7-mindray';

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
