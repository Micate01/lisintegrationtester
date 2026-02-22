export const MLLP_START = Buffer.from([0x0b]);
export const MLLP_END = Buffer.from([0x1c, 0x0d]);

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
