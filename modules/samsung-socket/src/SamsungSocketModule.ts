import { NativeModule, requireOptionalNativeModule } from 'expo';

type Events = {
  onOpen: () => void;
  onMessage: (e: { data: string }) => void;
  onClose: (e: { code: number; reason: string }) => void;
  onError: (e: { message: string }) => void;
};

declare class SamsungSocketModule extends NativeModule<Events> {
  connect(url: string): boolean;
  send(text: string): boolean;
  close(): void;
}

// null no iOS / Expo Go: o app cai para o WebSocket padrão (porta 8001).
export default requireOptionalNativeModule<SamsungSocketModule>('SamsungSocket');
