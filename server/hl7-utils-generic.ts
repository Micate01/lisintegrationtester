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

export function generateACK(originalMsh: string[], ackCode: string, errorMsg: string = '') {
  const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const originalControlId = originalMsh[9] || '1';
  
  const version = '2.3.1';
  const charset = 'ASCII';
  const sendingApp = 'LIS';
  const sendingDevice = 'LIS';
  
  const msh = `MSH|^~\\&|${sendingApp}|${sendingDevice}|||${date}||ACK^R01|${originalControlId}|P|${version}||||0||${charset}||||`;
  const msa = `MSA|${ackCode}|${originalControlId}|${errorMsg}|||0|`;
  
  return `${msh}\r${msa}\r`;
}
