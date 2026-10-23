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
        data: { appId, action_type: 'DEEP_LINK', ...(metaTag ? { metaTag } : {}) },
      },
    });
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

  /**
   * Abre um vídeo do YouTube na TV.
   * Usa o protocolo DIAL, o mesmo do botão "transmitir" do app do YouTube.
   * Samsung expõe o DIAL na porta 8080 (modelos mais novos também na 8001).
   */
  async playYouTube(videoId: string) {
    const { ip } = this.state;
    if (!ip) throw new Error('Nenhuma TV conectada');
    const body = `v=${videoId}`;
    for (const port of [8080, 8001]) {
      try {
        const res = await fetchWithTimeout(`http://${ip}:${port}/ws/apps/YouTube`, 4000, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body,
        });
        if (res.status === 200 || res.status === 201) return;
      } catch {
        // tenta a próxima porta
      }
    }
    // Plano B: abre o app do YouTube pelo canal de controle, passando o vídeo.
    if (!this.launchApp(APPS.youtube, body)) throw new Error('Não consegui abrir o YouTube na TV');
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
