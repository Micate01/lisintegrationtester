export const MLLP_START = Buffer.from([0x0b]);
export const MLLP_END = Buffer.from([0x1c, 0x0d]);

export function parseHL7(message: string) {
  const segments = message.split(/\r\n|\r|\n/).filter(s => s.trim() !== '');
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
  const msh = `MSH|^~\\&|LIS|LIS|||${date}||ACK^R01|1|P|2.3.1||||0||ASCII|||`;
  const msa = `MSA|${ackCode}|${controlId}|${errorMsg ? errorMsg : 'Message accepted'}|||0|`;
  return `${msh}\r${msa}\r`;
}
