import type { Channel } from './storage';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function get(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });
  if (!res.ok) throw new Error(`YouTube respondeu ${res.status}`);
  return res.text();
}

function meta(html: string, prop: string) {
  const m =
    html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`)) ??
    html.match(new RegExp(`<meta content="([^"]*)" property="${prop}"`));
  return m ? decodeEntities(m[1]) : undefined;
}

/** Aceita: link do canal, @handle, ID (UC...) ou link de um vídeo do canal. */
function toUrl(input: string): { url: string; isChannelPage: boolean } {
  const s = input.trim();
  if (/^UC[\w-]{22}$/.test(s)) return { url: `https://www.youtube.com/channel/${s}`, isChannelPage: true };
  if (s.startsWith('@')) return { url: `https://www.youtube.com/${s}`, isChannelPage: true };
  if (/youtube\.com|youtu\.be/.test(s)) {
    const url = s.startsWith('http') ? s : `https://${s}`;
    const isVideo = /watch\?|youtu\.be\/|\/shorts\/|\/live\//.test(url);
    return { url, isChannelPage: !isVideo };
  }
  return { url: `https://www.youtube.com/@${s.replace(/\s+/g, '')}`, isChannelPage: true };
}

export async function resolveChannel(input: string): Promise<Channel> {
  const { url, isChannelPage } = toUrl(input);
  let html = await get(url);

  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (!id) throw new Error('Não encontrei esse canal. Confira o link ou o @.');

  if (!isChannelPage) html = await get(`https://www.youtube.com/channel/${id}`);

  return {
    id,
    title: meta(html, 'og:title') ?? 'Canal do YouTube',
    avatar: meta(html, 'og:image'),
    addedAt: Date.now(),
  };
}

/** Playlist de uploads do canal: UCxxxx vira UUxxxx. Toca do vídeo mais recente. */
export const uploadsPlaylist = (channelId: string) => `UU${channelId.slice(2)}`;

export type Video = { id: string; title: string; published?: string };

/** Vídeos mais recentes do canal. Usa o feed RSS e, se falhar, a página de vídeos. */
export async function fetchRecentVideos(channelId: string): Promise<Video[]> {
  try {
    const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map(([, e]) => ({
        id: e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1] ?? '',
        title: decodeEntities(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Vídeo'),
        published: e.match(/<published>([^<]+)<\/published>/)?.[1],
      }))
      .filter((v) => v.id);
    if (videos.length) return videos;
  } catch {
    // segue para o plano B
  }
  const html = await get(`https://www.youtube.com/channel/${channelId}/videos`);
  const seen = new Set<string>();
  const out: Video[] = [];
  for (const m of html.matchAll(/"videoId":"([\w-]{11})"[\s\S]{0,400}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], title: JSON.parse(`"${m[2]}"`) });
    if (out.length >= 15) break;
  }
  if (!out.length) throw new Error('Não consegui buscar os vídeos desse canal.');
  return out;
}

export const thumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

export type ChannelResult = { id: string; title: string; avatar?: string; info?: string };

/** Busca canais por nome, como a busca do YouTube (filtro "Canais"). */
export async function searchChannels(query: string): Promise<ChannelResult[]> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'pt', gl: 'BR' } },
      query,
      params: 'EgIQAg==', // filtro: só canais
    }),
  });
  if (!res.ok) throw new Error(`A busca falhou (${res.status}).`);
  const json = await res.json();

  // Procura todos os "channelRenderer" na resposta, onde quer que estejam.
  const found: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.channelRenderer) found.push(node.channelRenderer);
    for (const k in node) walk(node[k]);
  };
  walk(json);

  const text = (t: any): string | undefined =>
    t?.simpleText ?? t?.runs?.map((r: any) => r.text).join('') ?? undefined;

  return found
    .filter((r) => r.channelId)
    .map((r) => {
      const thumbs = r.thumbnail?.thumbnails ?? [];
      let avatar: string | undefined = thumbs[thumbs.length - 1]?.url;
      if (avatar?.startsWith('//')) avatar = `https:${avatar}`;
      const info = [text(r.subscriberCountText), text(r.videoCountText)].filter(Boolean).join(' · ');
      return { id: r.channelId, title: text(r.title) ?? 'Canal', avatar, info: info || undefined };
    });
}

/** O texto parece link, @ ou ID de canal (em vez de um nome para buscar)? */
export const looksLikeChannelRef = (s: string) =>
  /^@|youtube\.com|youtu\.be|^UC[\w-]{22}$/.test(s.trim());
