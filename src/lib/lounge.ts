/**
 * YouTube Lounge: o protocolo que o app do YouTube no celular usa para
 * mandar vídeos para a TV ("Vincular com código de TV" / transmitir).
 *
 * Fluxo:
 * 1. Vincular uma vez: código de 12 dígitos da TV (ou screenId pelo DIAL) vira um screenId.
 * 2. Com o screenId, pegamos um loungeToken (expira em algumas semanas, renovamos sozinhos).
 * 3. Abrimos uma sessão (bind) e mandamos o comando setPlaylist com o vídeo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from '../tv/discovery';

const API = 'https://www.youtube.com/api/lounge';
const KEY = 'yt-screen:v1';
const DEVICE_KEY = 'yt-device:v1';
const NAME = 'Controle do Caio';

export type Screen = { screenId: string; loungeToken?: string; name?: string };

const form = (data: Record<string, string | number>) =>
  Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

const rand = () => Math.random().toString(36).slice(2, 14);

async function post(url: string, body: Record<string, string | number>) {
  return fetchWithTimeout(url, 8000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://www.youtube.com' },
    body: form(body),
  });
}

// ---------- Armazenamento ----------

export async function loadScreen(): Promise<Screen | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveScreen(s: Screen | null) {
  try {
    if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
    else await AsyncStorage.removeItem(KEY);
  } catch {}
}

async function deviceId() {
  try {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `${rand()}${rand()}`;
      await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `${rand()}${rand()}`;
  }
}

// ---------- Vincular ----------

/** Código mostrado no YouTube da TV em Configurações › Vincular com código de TV. */
export async function pairWithCode(code: string): Promise<Screen> {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 12) throw new Error('O código tem 12 números.');
  const res = await post(`${API}/pairing/get_screen`, { pairing_code: clean });
  if (!res.ok) throw new Error('Código inválido ou expirado. Gere um novo na TV.');
  const json = await res.json();
  const s = json?.screen;
  if (!s?.screenId) throw new Error('A TV não respondeu ao código.');
  const screen = { screenId: s.screenId, loungeToken: s.loungeToken, name: s.name };
  await saveScreen(screen);
  return screen;
}

/** Sem código: pergunta o screenId direto para a TV (funciona com o YouTube aberto nela). */
export async function pairViaDial(ip: string): Promise<Screen> {
  for (const port of [8080, 8001]) {
    try {
      const res = await fetchWithTimeout(`http://${ip}:${port}/ws/apps/YouTube`, 4000);
      if (!res.ok) continue;
      const xml = await res.text();
      const screenId = xml.match(/<screenId>([^<]+)<\/screenId>/)?.[1];
      if (screenId) {
        const screen: Screen = { screenId, loungeToken: await getToken(screenId) };
        await saveScreen(screen);
        return screen;
      }
    } catch {}
  }
  throw new Error('A TV não informou o YouTube. Use o código de 12 números.');
}

async function getToken(screenId: string): Promise<string> {
  const res = await post(`${API}/pairing/get_lounge_token_batch`, { screen_ids: screenId });
  if (!res.ok) throw new Error(`YouTube recusou o vínculo (${res.status}). Vincule de novo.`);
  const json = await res.json();
  const token = json?.screens?.[0]?.loungeToken;
  if (!token) throw new Error('Vínculo expirado. Vincule de novo.');
  return token;
}

// ---------- Tocar ----------

async function bind(screen: Screen) {
  const id = await deviceId();
  const res = await post(
    `${API}/bc/bind?${form({
      device: 'REMOTE_CONTROL',
      id,
      name: NAME,
      app: 'youtube-desktop',
      'mdx-version': 3,
      loungeIdToken: screen.loungeToken!,
      VER: 8,
      v: 2,
      RID: 1,
      CVER: 1,
      zx: rand(),
      t: 1,
    })}`,
    { count: 0 },
  );
  if (!res.ok) return { ok: false as const, status: res.status };
  const text = await res.text();
  const sid = text.match(/\["c","([^"]+)"/)?.[1];
  const gsessionid = text.match(/\["S","([^"]+)"\]/)?.[1];
  if (!sid || !gsessionid) return { ok: false as const, status: 0 };
  return { ok: true as const, id, sid, gsessionid };
}

/** Toca um vídeo na TV. Devolve o screen (com token renovado, se precisou). */
export async function playVideo(screen: Screen, videoId: string): Promise<Screen> {
  let current = { ...screen };
  if (!current.loungeToken) current.loungeToken = await getToken(current.screenId);

  let session = await bind(current);
  if (!session.ok) {
    // Token vencido: renova e tenta de novo.
    current.loungeToken = await getToken(current.screenId);
    session = await bind(current);
  }
  if (!session.ok) throw new Error(`Não consegui falar com o YouTube da TV (${session.status}).`);
  await saveScreen(current);

  const res = await post(
    `${API}/bc/bind?${form({
      device: 'REMOTE_CONTROL',
      id: session.id,
      name: NAME,
      app: 'youtube-desktop',
      'mdx-version': 3,
      loungeIdToken: current.loungeToken!,
      SID: session.sid,
      gsessionid: session.gsessionid,
      VER: 8,
      v: 2,
      RID: 2,
      CVER: 1,
      zx: rand(),
      t: 1,
    })}`,
    {
      count: 1,
      ofs: 0,
      req0__sc: 'setPlaylist',
      req0_videoId: videoId,
      req0_videoIds: videoId,
      req0_currentTime: 0,
      req0_currentIndex: 0,
    },
  );
  if (!res.ok) throw new Error(`O YouTube da TV recusou o vídeo (${res.status}).`);
  return current;
}
