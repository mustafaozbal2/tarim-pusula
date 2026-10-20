import { inflateRawSync } from 'node:zlib';

/** Açılmış toplam boyut sınırı (zip bombası koruması). */
export const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;

/**
 * Minimal ZIP okuyucu (yalnız okuma): merkez dizinini okur, stored (0) ve deflate (8) girdilerini açar.
 * Şifreli, çok parçalı ve zip64 dosyalar reddedilir. Dışarıdan bir paket gerekmez.
 */
export function readZip(buf: Uint8Array, want: (name: string) => boolean): Map<string, Buffer> {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP değil');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error('zip64 desteklenmiyor');
  const out = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP bozuk');
    const flags = b.readUInt16LE(p + 8);
    const method = b.readUInt16LE(p + 10);
    const csize = b.readUInt32LE(p + 20);
    const usize = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const commentLen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    if (flags & 1) throw new Error('şifreli ZIP desteklenmiyor');
    total += usize;
    if (total > MAX_UNZIPPED_BYTES) throw new Error('ZIP açılınca çok büyük');
    if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIP bozuk');
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + csize);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) {
      out.set(name, inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED_BYTES }));
    } else throw new Error('ZIP sıkıştırma yöntemi desteklenmiyor');
  }
  return out;
}
