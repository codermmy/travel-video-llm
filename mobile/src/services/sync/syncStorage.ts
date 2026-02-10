import { Platform } from 'react-native';

type SyncLocalState = {
  lastCursor: string | null;
  lastPullAt: string | null;
};

const NATIVE_DIR = 'app-storage';
const NATIVE_FILE = 'sync-storage.json';

type NativeFs = typeof import('expo-file-system/legacy');

let fsModule: NativeFs | null = null;

async function getFs(): Promise<NativeFs> {
  if (!fsModule) {
    fsModule = await import('expo-file-system/legacy');
  }
  return fsModule;
}

async function getNativePath(): Promise<string> {
  const fs = await getFs();
  const baseDir = fs.documentDirectory ?? fs.cacheDirectory;
  if (!baseDir) {
    throw new Error('sync_storage_base_dir_missing');
  }
  const dir = `${baseDir}${NATIVE_DIR}/`;
  const info = await fs.getInfoAsync(dir);
  if (!info.exists) {
    await fs.makeDirectoryAsync(dir, { intermediates: true });
  }
  return `${dir}${NATIVE_FILE}`;
}

async function readNativeAll(): Promise<Record<string, SyncLocalState>> {
  const fs = await getFs();
  const path = await getNativePath();
  const info = await fs.getInfoAsync(path);
  if (!info.exists) {
    return {};
  }
  const raw = await fs.readAsStringAsync(path);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return (parsed as Record<string, SyncLocalState>) || {};
  } catch {
    return {};
  }
}

async function writeNativeAll(payload: Record<string, SyncLocalState>): Promise<void> {
  const fs = await getFs();
  const path = await getNativePath();
  await fs.writeAsStringAsync(path, JSON.stringify(payload));
}

async function readWeb(userId: string): Promise<SyncLocalState | null> {
  const key = `sync_state_${userId}`;
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SyncLocalState;
  } catch {
    return null;
  }
}

async function writeWeb(userId: string, state: SyncLocalState): Promise<void> {
  const key = `sync_state_${userId}`;
  localStorage.setItem(key, JSON.stringify(state));
}

async function clearWeb(userId: string): Promise<void> {
  localStorage.removeItem(`sync_state_${userId}`);
}

export const syncStorage = {
  async get(userId: string): Promise<SyncLocalState | null> {
    if (!userId) {
      return null;
    }
    if (Platform.OS === 'web') {
      return readWeb(userId);
    }
    const all = await readNativeAll();
    return all[userId] || null;
  },

  async save(userId: string, state: SyncLocalState): Promise<void> {
    if (!userId) {
      return;
    }
    if (Platform.OS === 'web') {
      await writeWeb(userId, state);
      return;
    }
    const all = await readNativeAll();
    all[userId] = state;
    await writeNativeAll(all);
  },

  async clear(userId: string): Promise<void> {
    if (!userId) {
      return;
    }
    if (Platform.OS === 'web') {
      await clearWeb(userId);
      return;
    }
    const all = await readNativeAll();
    delete all[userId];
    await writeNativeAll(all);
  },
};

export type { SyncLocalState };
