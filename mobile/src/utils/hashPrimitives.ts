export function compareHashes(hash1: string, hash2: string): boolean {
  return hash1.toLowerCase() === hash2.toLowerCase();
}

export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}
