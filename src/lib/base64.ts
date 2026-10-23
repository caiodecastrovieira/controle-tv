// Base64 com suporte a acentos (UTF-8), sem depender de APIs do navegador.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export function toBase64(str: string): string {
  const b = utf8Bytes(str);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63];
    out += i + 1 < b.length ? CHARS[(n >> 6) & 63] : '=';
    out += i + 2 < b.length ? CHARS[n & 63] : '=';
  }
  return out;
}

export function fromBase64(b64: string): string {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (CHARS.indexOf(clean[i]) << 18) |
      (CHARS.indexOf(clean[i + 1]) << 12) |
      ((CHARS.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (CHARS.indexOf(clean[i + 3] ?? 'A') & 63);
    bytes.push((n >> 16) & 255);
    if (i + 2 < clean.length) bytes.push((n >> 8) & 255);
    if (i + 3 < clean.length) bytes.push(n & 255);
  }
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCodePoint(c);
    else if (c < 0xe0) out += String.fromCodePoint(((c & 31) << 6) | (bytes[i++] & 63));
    else if (c < 0xf0)
      out += String.fromCodePoint(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    else
      out += String.fromCodePoint(
        ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63),
      );
  }
  return out;
}
