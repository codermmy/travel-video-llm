declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;

  export const EncodingType: {
    UTF8: 'utf8';
    Base64: 'base64';
  };

  export type FileInfo =
    | { exists: false; uri: string; isDirectory: false }
    | { exists: true; uri: string; isDirectory: boolean; size?: number };

  export function getInfoAsync(fileUri: string, options?: object): Promise<FileInfo>;
  export function readAsStringAsync(fileUri: string, options?: object): Promise<string>;
  export function makeDirectoryAsync(fileUri: string, options?: object): Promise<void>;
  export function deleteAsync(fileUri: string, options?: object): Promise<void>;
  export function readDirectoryAsync(fileUri: string): Promise<string[]>;
  export function moveAsync(options: { from: string; to: string }): Promise<void>;
}
