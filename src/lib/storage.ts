import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedTV = { ip: string; name?: string; token?: string };
export type Channel = { id: string; title: string; avatar?: string; addedAt: number };

const TV_KEY = 'tv:v1';
const CHANNELS_KEY = 'channels:v1';

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem armazenamento, o app segue funcionando nesta sessão
  }
}

export const loadTV = () => read<SavedTV | null>(TV_KEY, null);
export const saveTV = (tv: SavedTV | null) =>
  tv ? write(TV_KEY, tv) : AsyncStorage.removeItem(TV_KEY).catch(() => {});

export const loadChannels = () => read<Channel[]>(CHANNELS_KEY, []);
export const saveChannels = (list: Channel[]) => write(CHANNELS_KEY, list);
