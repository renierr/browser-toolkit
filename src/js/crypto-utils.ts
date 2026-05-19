/**
 * Hashes a Uint8Array using SHA-1 via SubtleCrypto if available, or a fallback FNV-1a variant.
 */
export async function hashUint8Array(data: Uint8Array): Promise<string> {
  const view = data;
  const len = view.byteLength;
  const bufferSourceForFull: BufferSource = view as unknown as BufferSource;

  const subtleAvailable =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).crypto?.subtle?.digest === 'function';

  if (subtleAvailable) {
    try {
      const hashBuf = (await (globalThis as any).crypto.subtle.digest(
        'SHA-1',
        bufferSourceForFull
      )) as ArrayBuffer;
      const hashArray = Array.from(new Uint8Array(hashBuf));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      console.warn('crypto.subtle.digest failed, falling back to JS hash', err);
    }
  }

  // Fallback hashing (FNV-1a variant) for environments without SubtleCrypto
  let h1 = BigInt(0xcbf29ce484222325n);
  const prime = BigInt(0x100000001b3n);
  for (let i = 0; i < len; i++) {
    h1 ^= BigInt(view[i]);
    h1 = (h1 * prime) & BigInt('0xFFFFFFFFFFFFFFFF');
  }
  return h1.toString(16).padStart(16, '0');
}
