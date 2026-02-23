import * as net from 'net';
import { getDb } from '../db';
import { MLLP_START, MLLP_END } from '../hl7-medconn-utils';
import { handleMedconnMessage } from '../hl7-medconn';

export function startMedconnAdapter(port: number, equipmentId: number) {
  const server = net.createServer((socket) => {
    console.log(`[Medconn] Client connected to equipment ${equipmentId} (Port ${port})`);

    // Keep connection alive
    socket.setKeepAlive(true, 10000);

    // Update status to connected
    getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['connected', equipmentId])
      .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));

    let buffer = Buffer.alloc(0);

    socket.on('data', async (data) => {
      console.log(`[Adapter ${equipmentId}] Received ${data.length} bytes. Hex: ${data.toString('hex')}`);
      console.log(`[Adapter ${equipmentId}] ASCII preview: ${data.toString('utf8').replace(/[\x00-\x1F\x7F]/g, '.')}`);
      
      buffer = Buffer.concat([buffer, data]);
      
      let startIndex = buffer.indexOf(MLLP_START);
      let endIndex = buffer.indexOf(MLLP_END);
      
      console.log(`[Adapter ${equipmentId}] Buffer state - Length: ${buffer.length}, StartIdx: ${startIndex}, EndIdx: ${endIndex}`);

      if (startIndex === -1 && buffer.length > 0) {
          console.warn(`[Adapter ${equipmentId}] WARNING: Data received but no MLLP Start Block (0x0B) found yet.`);
          
          // Fallback: Check for Raw HL7 (starts with MSH)
          // NOTE: This raw mode violates the Medconn HL7 protocol documentation (Section 1.2, Page 4),
          // which strictly requires MLLP framing (<SB> ... <EB><CR>).
          // This fallback is maintained ONLY as a non-standard workaround for non-compliant senders.
          const mshIndex = buffer.indexOf('MSH');
          if (mshIndex !== -1) {
              console.log(`[Adapter ${equipmentId}] Detected potential Raw HL7 (starts with MSH) at index ${mshIndex}`);
              const lastCR = buffer.lastIndexOf(0x0d);
              
              if (lastCR !== -1 && lastCR > mshIndex) {
                  console.log(`[Adapter ${equipmentId}] Found CR at ${lastCR}, attempting to process as Raw HL7`);
                  const payload = buffer.subarray(mshIndex, lastCR + 1);
                  const hl7Message = payload.toString('utf8');
                  
                  console.log(`[Adapter ${equipmentId}] Processing Raw message:`, hl7Message.substring(0, 50) + '...');
                  
                  try {
                      await handleMedconnMessage(hl7Message, socket, equipmentId, { isRaw: true });
                  } catch (err) {
                      console.error(`[Adapter ${equipmentId}] Error processing raw message:`, err);
                  }
                  
                  // Advance buffer
                  buffer = buffer.subarray(lastCR + 1);
                  startIndex = buffer.indexOf(MLLP_START);
                  endIndex = buffer.indexOf(MLLP_END);
              }
          }
      }

      while (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const payload = buffer.subarray(startIndex + 1, endIndex);
        const hl7Message = payload.toString('utf8');
        
        console.log(`[Adapter ${equipmentId}] Processing complete message (utf8, ${payload.length} bytes)`);

        try {
            await handleMedconnMessage(hl7Message, socket, equipmentId, { isRaw: false });
        } catch (err) {
            console.error(`[Adapter ${equipmentId}] Error processing message:`, err);
        }

        buffer = buffer.subarray(endIndex + MLLP_END.length);
        startIndex = buffer.indexOf(MLLP_START);
        endIndex = buffer.indexOf(MLLP_END);
      }
      
      if (buffer.length > 0) {
          console.log(`[Adapter ${equipmentId}] ${buffer.length} bytes remaining in buffer (waiting for more data or delimiter)`);
      }
    });

    socket.on('close', () => {
        console.log(`[Medconn] Client disconnected from equipment ${equipmentId}`);
        // Update status to disconnected
        getDb().query('UPDATE equipments SET status = $1 WHERE id = $2', ['disconnected', equipmentId])
          .catch(err => console.error(`Failed to update status for equipment ${equipmentId}:`, err));
    });

    socket.on('error', (err) => {
      console.error(`Adapter ${equipmentId} socket error:`, err);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Medconn Adapter for equipment ${equipmentId} listening on port ${port}`);
  });
  
  return server;
}
