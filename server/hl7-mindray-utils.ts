export const MLLP_START = Buffer.from([0x0b]);
export const MLLP_END = Buffer.from([0x1c, 0x0d]);

export function parseHL7(message: string) {
  // Strictly split on \r only for full compliance
  const segments = message.split('\r').filter(s => s.trim() !== '');
  return segments.map(segment => {
    const parts = segment.trimStart().split('|');
    if (parts.length > 0) {
      parts[0] = parts[0].trim();
    }
    return parts;
  });
}

export function generateBS200ACK(originalMsh: string[], ackCode: string, errorMsg: string = '', messageControlId: string = '') {
  const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const controlId = messageControlId || originalMsh[9] || '1';
  const sendingApp = originalMsh[2] || '';
  const sendingFac = originalMsh[3] || '';
  
  // MSH-3 and MSH-4 should be empty or Manufacturer/Model. We swap them to MSH-5 and MSH-6.
  // MSH-5 and MSH-6 are Receiving App and Receiving Facility.
  const msh = `MSH|^~\\&|||${sendingApp}|${sendingFac}|${date}||ACK^R01|${controlId}|P|2.3.1||||0||ASCII|||`;
  const msa = `MSA|${ackCode}|${controlId}|${errorMsg ? errorMsg : 'Message accepted'}|||0|`;
  return `${msh}\r${msa}\r`;
}
