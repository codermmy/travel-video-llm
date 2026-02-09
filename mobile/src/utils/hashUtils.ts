import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { compareHashes, isValidHash } from '@/utils/hashPrimitives';

export async function calculateFileHash(fileUri: string): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    throw new Error(`文件不存在: ${fileUri}`);
  }

  const content = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export async function calculateFileHashes(
  fileUris: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<{ uri: string; hash: string }[]> {
  const results: { uri: string; hash: string }[] = [];
  const total = fileUris.length;

  for (let i = 0; i < total; i += 1) {
    const uri = fileUris[i];
    try {
      const hash = await calculateFileHash(uri);
      results.push({ uri, hash });
    } catch {
      results.push({ uri, hash: '' });
    } finally {
      onProgress?.(i + 1, total);
    }
  }

  return results;
}

export { compareHashes, isValidHash };
