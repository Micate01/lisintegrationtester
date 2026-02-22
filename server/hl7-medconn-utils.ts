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
