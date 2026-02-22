export const MLLP_START = Buffer.from([0x0b]);
export const MLLP_END = Buffer.from([0x1c, 0x0d]);

export function parseHL7(message: string) {
  // Handle \r\n, \n, \r
  // Also handle the case where segments might be concatenated without proper delimiters if possible, 
  // but primarily focus on standard delimiters.
  // Some systems might use \n instead of \r.
  const segments = message.split(/\r\n|\r|\n/).filter(s => s.trim() !== '');
  return segments.map(segment => {
    const parts = segment.trimStart().split('|');
    // Also trim the segment name just in case
    if (parts.length > 0) {
      parts[0] = parts[0].trim();
    }
    return parts;
  });
}

export function generateACK(originalMsh: string[], ackCode: string, errorMsg: string = '', isMedconn: boolean = false) {
  const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const originalControlId = originalMsh[9] || '1';
  
  // Medconn-specific compliance
  const version = isMedconn ? '2.4' : '2.3.1';
  const charset = isMedconn ? 'UNICODE' : 'ASCII';
  const sendingApp = isMedconn ? 'Medconn' : 'LIS';
  const sendingDevice = isMedconn ? 'MH' : 'LIS';
  
  const msh = `MSH|^~\\&|${sendingApp}|${sendingDevice}|||${date}||ACK^R01|${originalControlId}|P|${version}||||0||${charset}||||`;
  const msa = `MSA|${ackCode}|${originalControlId}|${errorMsg}|||0|`;
  
  return `${msh}\r${msa}\r`;
}
