import { Buffer } from 'node:buffer';

/** Encode fixture documents only. JSON padding is space, BIN padding zero. */
export function encodeGlb(document, binary = Buffer.alloc(0)) {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4, binLength = Math.ceil(binary.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonLength, 12); bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.fill(0x20, 20, 20 + jsonLength); json.copy(bytes, 20);
  bytes.writeUInt32LE(binLength, 20 + jsonLength); bytes.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(bytes, 28 + jsonLength); return bytes;
}
