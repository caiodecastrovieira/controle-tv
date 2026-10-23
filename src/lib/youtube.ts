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
