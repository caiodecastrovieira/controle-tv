import { useEffect, useState } from 'react';
import NativeSocket from '../../modules/samsung-socket/src/SamsungSocketModule';
import { fromBase64, toBase64 } from '../lib/base64';
import { saveTV, type SavedTV } from '../lib/storage';
import { fetchWithTimeout } from './discovery';

export type Status = 'idle' | 'connecting' | 'waiting-permission' | 'connected' | 'error';

export type TVState = {
  status: Status;
  ip?: string;
  name?: string;
  error?: string;
  /** A TV abriu um teclado na tela (campo de busca, login etc.) */
  imeOpen: boolean;
  /** Texto que está no campo da TV agora */
  imeText: string;
};

export type InstalledApp = { appId: string; name: string };

export const APPS = {
  netflix: '3201907018807',
  prime: '3201910019365',
  youtube: '111299001912',
} as const;

export type AppKey = keyof typeof APPS;

/** IDs conhecidos por modelo/ano. O primeiro que existir na TV é usado. */
const APP_CANDIDATES: Record<AppKey, string[]> = {
  netflix: ['3201907018807', '11101200001', 'RN1MCdNq8t.Netflix', '3201506003488'],
  prime: ['3201910019365', '3201512006785', 'org.tizen.ignition', 'evKhCgZelL.AmazonIgnitionLauncher2'],
  youtube: ['111299001912', '9Ur5IzDKqV.TizenYouTube', '3201502001815'],
};

/** Como o app aparece na lista de instalados da TV. */
const APP_NAMES: Record<AppKey, RegExp> = {
  netflix: /^netflix$/i,
  prime: /prime video|amazon/i,
  youtube: /^youtube$/i,
};

const REMOTE_NAME = toBase64('Controle do Caio');
const RECONNECT_MS = 3000;

class SamsungTV {
  state: TVState = { status: 'idle', imeOpen: false, imeText: '' };
  private listeners = new Set<(s: TVState) => void>();
  private ws: WebSocket | null = null;
  private subs: { remove(): void }[] = [];
  private token?: string;
  private mode: 'secure' | 'plain' = 'secure';
  private everConnected = false;
  private manualClose = false;
  private permissionTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private appsWaiter?: (apps: InstalledApp[]) => void;

  subscribe(fn: (s: TVState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<TVState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  // ---------- Conexão ----------

  connect(tv: SavedTV) {
    this.manualClose = false;
    this.everConnected = false;
    this.token = tv.token;
    this.mode = NativeSocket ? 'secure' : 'plain';
    clearTimeout(this.reconnectTimer);
    this.set({ status: 'connecting', ip: tv.ip, name: tv.name, error: undefined });
    this.open();
  }

  disconnect() {
    this.manualClose = true;
    clearTimeout(this.reconnectTimer);
    this.teardown();
    this.set({ status: 'idle', error: undefined, imeOpen: false });
  }

  private url() {
    const { ip } = this.state;
    const base =
      this.mode === 'secure'
        ? `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${REMOTE_NAME}`
        : `ws://${ip}:8001/api/v2/channels/samsung.remote.control?name=${REMOTE_NAME}`;
    return this.token ? `${base}&token=${this.token}` : base;
  }

  private open() {
    this.teardown();
    const url = this.url();
    if (NativeSocket) {
      this.subs = [
        NativeSocket.addListener('onOpen', () => this.onOpen()),
        NativeSocket.addListener('onMessage', (e) => this.onMessage(e.data)),
        NativeSocket.addListener('onClose', () => this.onClosed()),
        NativeSocket.addListener('onError', (e) => this.onFailed(e.message)),
      ];
      NativeSocket.connect(url);
    } else {
      const ws = new WebSocket(url);
      ws.onopen = () => this.onOpen();
      ws.onmessage = (e) => this.onMessage(String(e.data));
      ws.onclose = () => ws === this.ws && this.onClosed();
      ws.onerror = () => ws === this.ws && this.onFailed('Falha na conexão');
      this.ws = ws;
    }
  }

  private teardown() {
    clearTimeout(this.permissionTimer);
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    if (NativeSocket) NativeSocket.close();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
  }

  private onOpen() {
    // Se a TV não responder logo, é porque está mostrando o pedido de permissão.
    this.permissionTimer = setTimeout(() => {
      if (this.state.status === 'connecting') this.set({ status: 'waiting-permission' });
    }, 1200);
  }

  private onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.event) {
      case 'ms.channel.connect': {
        clearTimeout(this.permissionTimer);
        if (msg.data?.token) this.token = String(msg.data.token);
        this.everConnected = true;
        this.set({ status: 'connected', error: undefined });
        saveTV({ ip: this.state.ip!, name: this.state.name, token: this.token });
        break;
      }
      case 'ms.channel.unauthorized':
        this.manualClose = true;
        this.teardown();
        this.set({ status: 'error', error: 'A TV recusou a conexão. Tente de novo e escolha "Permitir".' });
        break;
      case 'ms.channel.timeOut':
        this.manualClose = true;
        this.teardown();
        this.set({ status: 'error', error: 'O pedido de permissão expirou na TV. Tente de novo.' });
        break;
      case 'ms.remote.imeStart':
        this.set({ imeOpen: true, imeText: msg.data ? safeDecode(msg.data) : '' });
        break;
      case 'ms.remote.imeUpdate':
        this.set({ imeOpen: true, imeText: safeDecode(msg.data ?? '') });
        break;
      case 'ms.remote.imeEnd':
        this.set({ imeOpen: false, imeText: '' });
        break;
      case 'ed.installedApp.get': {
        const list: any[] = msg.data?.data ?? [];
        this.appsWaiter?.(
          list
            .map((a) => ({ appId: String(a.appId), name: String(a.name) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        );
        this.appsWaiter = undefined;
        break;
      }
    }
  }

  private onFailed(message: string) {
    if (!this.everConnected && this.mode === 'secure') {
      // TVs mais antigas só aceitam a porta 8001 sem criptografia.
      this.mode = 'plain';
      this.open();
      return;
    }
    this.teardown();
    if (this.manualClose) return;
    if (this.everConnected) return this.scheduleReconnect();
    this.set({
      status: 'error',
      error: `Não consegui falar com a TV (${message}). Confira se ela está ligada e no mesmo Wi-Fi.`,
    });
  }

  private onClosed() {
    this.teardown();
    if (this.manualClose) return;
    if (this.everConnected) this.scheduleReconnect();
    else this.onFailed('conexão fechada');
  }

  private scheduleReconnect() {
    this.set({ status: 'connecting', imeOpen: false });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.manualClose) return;
      this.mode = NativeSocket ? 'secure' : 'plain';
      this.everConnected = false;
      this.open();
    }, RECONNECT_MS);
  }

  /** Volta a conectar quando o app volta pro primeiro plano. */
  wake() {
    if (this.state.ip && !this.manualClose && this.state.status !== 'connected') {
      this.connect({ ip: this.state.ip, name: this.state.name, token: this.token });
    }
  }

  // ---------- Comandos ----------

  private send(payload: object): boolean {
    if (this.state.status !== 'connected') return false;
    const text = JSON.stringify(payload);
    if (NativeSocket) return NativeSocket.send(text);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
      return true;
    }
    return false;
  }

  key(key: string) {
    return this.send({
      method: 'ms.remote.control',
      params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
    });
  }

  /** Substitui o texto do campo aberto na TV. */
  typeText(text: string) {
    return this.send({
      method: 'ms.remote.control',
      params: { Cmd: toBase64(text), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' },
    });
  }

  /** Confirma o texto e fecha o teclado da TV. */
  finishText() {
    return this.send({ method: 'ms.remote.control', params: { TypeOfRemote: 'SendInputEnd' } });
  }

  launchApp(appId: string, metaTag?: string) {
    return this.send({
      method: 'ms.channel.emit',
      params: {
        event: 'ed.apps.launch',
        to: 'host',
        data: metaTag
          ? { appId, action_type: 'DEEP_LINK', metaTag }
          : { appId, action_type: 'NATIVE_LAUNCH' },
      },
    });
  }

  private resolvedApps: Partial<Record<AppKey, string>> = {};

  /** Descobre o ID real do app nesta TV. */
  private async resolveApp(key: AppKey): Promise<string> {
    const cached = this.resolvedApps[key];
    if (cached) return cached;
    const { ip } = this.state;

    // 1. Pela lista de apps instalados (mais confiável).
    try {
      const apps = await this.getInstalledApps();
      const hit = apps.find((a) => APP_NAMES[key].test(a.name.trim()));
      if (hit) return (this.resolvedApps[key] = hit.appId);
    } catch {}

    // 2. Perguntando à TV se cada ID conhecido existe.
    for (const id of APP_CANDIDATES[key]) {
      try {
        const res = await fetchWithTimeout(`http://${ip}:8001/api/v2/applications/${id}`, 2000);
        if (res.ok) return (this.resolvedApps[key] = id);
      } catch {}
    }
    return APPS[key];
  }

  /** Abre Netflix, Prime ou YouTube, achando o ID certo para esta TV. */
  async openApp(key: AppKey) {
    if (this.state.status !== 'connected') throw new Error('Conecte a TV primeiro.');
    const id = await this.resolveApp(key);
    await this.launchById(id);
    if (key === 'youtube') this.youtubeOpenedAt = Date.now();
  }

  /** Abre um app pelo ID: tenta pela API da TV e, se não der, pelo canal de controle. */
  async launchById(appId: string) {
    const { ip } = this.state;
    try {
      const res = await fetchWithTimeout(`http://${ip}:8001/api/v2/applications/${appId}`, 2500, {
        method: 'POST',
      });
      if (res.ok) return;
    } catch {}
    if (!this.launchApp(appId)) throw new Error('Conecte a TV primeiro.');
  }


  getInstalledApps(): Promise<InstalledApp[]> {
    return new Promise((resolve, reject) => {
      const ok = this.send({
        method: 'ms.channel.emit',
        params: { event: 'ed.installedApp.get', to: 'host' },
      });
      if (!ok) return reject(new Error('TV desconectada'));
      const timer = setTimeout(() => {
        this.appsWaiter = undefined;
        reject(new Error('A TV não respondeu a lista de apps'));
      }, 5000);
      this.appsWaiter = (apps) => {
        clearTimeout(timer);
        resolve(apps);
      };
    });
  }

  private youtubeOpenedAt = 0;

  /**
   * Garante o YouTube aberto na TV antes de mandar um vídeo.
   * Se o app não foi aberto por nós há pouco, abre e espera ele carregar.
   */
  async ensureYouTubeOpen() {
    if (Date.now() - this.youtubeOpenedAt < 10 * 60 * 1000) return;
    await this.openApp('youtube');
    await new Promise((r) => setTimeout(r, 6000));
  }
}

function safeDecode(b64: string) {
  try {
    return fromBase64(b64);
  } catch {
    return '';
  }
}

export const tv = new SamsungTV();

export function useTV() {
  const [state, setState] = useState(tv.state);
  useEffect(() => tv.subscribe(setState), []);
  return state;
}
