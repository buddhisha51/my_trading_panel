const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a 26-character lexicographically time-sortable ULID string
 * without external dependencies.
 */
export function generateUlid(nowMs: number = Date.now()): string {
  let time = Math.max(0, Math.floor(nowMs));
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = ENCODING[time % 32] + timePart;
    time = Math.floor(time / 32);
  }

  const randomBytes = new Uint8Array(10);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Encode 80 random bits into 16 Crockford base32 chars
  let randPart = '';
  let buffer = 0;
  let bitsLeft = 0;
  for (const byte of randomBytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      randPart += ENCODING[(buffer >>> bitsLeft) & 31];
    }
  }
  return `${timePart}${randPart.slice(0, 16)}`;
}
