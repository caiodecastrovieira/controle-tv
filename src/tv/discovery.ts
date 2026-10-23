import * as Network from 'expo-network';

export type FoundTV = { ip: string; name: string; model?: string };

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Pergunta à TV quem ela é. Toda Samsung Tizen responde na porta 8001. */
export async function probe(ip: string, ms = 1500): Promise<FoundTV | null> {
  try {
    const res = await fetchWithTimeout(`http://${ip}:8001/api/v2/`, ms);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.device) return null;
    const name = String(json.device.name ?? json.name ?? 'TV Samsung').replace(/^\[TV\]\s*/, '');
    return { ip, name, model: json.device.modelName };
  } catch {
    return null;
  }
}

/** Varre a rede Wi-Fi (x.x.x.1 a x.x.x.254) procurando TVs Samsung. */
export async function scanNetwork(
  onFound: (tv: FoundTV) => void,
  shouldStop: () => boolean,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const myIp = await Network.getIpAddressAsync();
  const parts = myIp?.split('.') ?? [];
  if (parts.length !== 4 || myIp === '0.0.0.0') {
    throw new Error('Conecte o celular no mesmo Wi-Fi da TV.');
  }
  const prefix = parts.slice(0, 3).join('.');
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`).filter((h) => h !== myIp);

  const BATCH = 32;
  for (let i = 0; i < hosts.length; i += BATCH) {
    if (shouldStop()) return;
    const found = await Promise.all(hosts.slice(i, i + BATCH).map((h) => probe(h, 1200)));
    found.forEach((tv) => tv && onFound(tv));
    onProgress?.(Math.min(1, (i + BATCH) / hosts.length));
  }
}

export { fetchWithTimeout };
