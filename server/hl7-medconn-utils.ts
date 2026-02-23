export const MLLP_START = Buffer.from([0x0b]);
export const MLLP_END = Buffer.from([0x1c, 0x0d]);

export function parseHL7(message: string) {
  // Use strict \r split per HL7 standard
  const segments = message.split('\r').filter(s => s.trim() !== '');
  
  // Validate MSH-2 delimiters if MSH segment exists
  const mshSegment = segments.find(s => s.startsWith('MSH|'));
  if (mshSegment) {
    const mshParts = mshSegment.split('|');
    if (mshParts.length > 1 && mshParts[1] !== '^~\\&') {
      console.warn(`[MedconnAdapter] Warning: MSH-2 delimiters are '${mshParts[1]}', expected '^~\\&'`);
    }
  }

  return segments.map(segment => {
    const parts = segment.trimStart().split('|');
    if (parts.length > 0) {
      parts[0] = parts[0].trim();
    }
    return parts;
  });
}
