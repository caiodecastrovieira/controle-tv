# Controle TV

Controle remoto para TV Samsung (Tizen, 2016 em diante) pelo Wi-Fi. Android.

## O que faz

- **Controle:** liga/desliga, volume, canal, direcional, voltar, início, fonte, mídia, números e botões coloridos. Volume, canal e setas repetem se você segurar.
- **Apps:** atalhos para Netflix, Prime Video e YouTube, mais a lista de todos os apps instalados na TV.
- **Teclado:** o que você digita no celular aparece no campo aberto na TV, em tempo real. "Enviar" confirma e fecha o teclado da TV.
- **Canais:** lista dos seus canais do YouTube. Cole o link, o @ ou o link de um vídeo. Tocar no canal abre o YouTube na TV com os vídeos mais recentes dele. Segure para remover. Seta para subir na lista.

## Como gerar o APK (sem Android Studio)

Usa o EAS Build, da Expo. A compilação roda na nuvem e você recebe um link do APK.

```bash
npm install
npm install -g eas-cli
eas login            # crie uma conta grátis em expo.dev se não tiver
eas build -p android --profile preview
```

No fim aparece um link e um QR code. Abra no celular, baixe e instale o APK (o Android vai pedir para permitir instalação de fonte desconhecida).

## Como rodar em modo desenvolvimento (com Android Studio)

Útil para mexer no código e ver as mudanças na hora.

```bash
npm install
npx expo run:android   # com o celular plugado no USB e depuração USB ativa
```

Depois disso, `npx expo start` atualiza o app a cada mudança no JavaScript.

> Expo Go não funciona aqui. O app tem um módulo nativo (`modules/samsung-socket`) para aceitar o certificado autoassinado da TV na porta 8002.

## Primeira conexão

1. TV ligada e no mesmo Wi-Fi do celular.
2. Abra o app. Ele procura TVs sozinho. Toque na sua.
3. A TV mostra um pedido de permissão. Escolha **Permitir** com o controle original.
4. Pronto. O app guarda a autorização e reconecta sozinho das próximas vezes.

Se a TV não aparecer, digite o IP manualmente. Fica em Configurações › Geral › Rede › Status da rede › Configurações de IP. Vale fixar esse IP no roteador para ele não mudar.

## Limitações conhecidas

- **Ligar a TV:** o botão desliga, mas não liga a TV desligada pelo Wi-Fi. Isso exige Wake-on-LAN (pacote UDP), que ainda não está implementado. Próximo passo natural.
- **Teclado:** só funciona quando a TV está com um campo de texto aberto (busca, login). Alguns apps usam teclado próprio e ignoram o texto externo.
- **Canais:** a TV toca a playlist de uploads do canal, não abre a página do canal. É o mesmo mecanismo do botão "transmitir" do YouTube (protocolo DIAL, porta 8080).
- **IDs dos apps:** Netflix, Prime e YouTube usam os IDs mais comuns de TVs 2019+. Em modelos mais antigos podem ser outros. A lista "Todos os apps" sempre usa os IDs reais da sua TV.

## Estrutura

```
App.tsx                        cabeçalho, abas e reconexão automática
src/tv/SamsungTV.ts            conexão, teclas, texto, apps, YouTube
src/tv/discovery.ts            busca de TVs na rede
src/lib/youtube.ts             descobre o canal a partir do link ou @
src/lib/storage.ts             TV salva e lista de canais
src/screens/                   Controle, Teclado, Canais, Conectar
modules/samsung-socket/        WebSocket nativo (Kotlin) para a porta 8002
```

## Como a comunicação funciona

| O quê | Como |
|---|---|
| Achar a TV | `GET http://IP:8001/api/v2/` em cada IP da rede |
| Teclas | WebSocket `wss://IP:8002/api/v2/channels/samsung.remote.control`, evento `ms.remote.control` |
| Texto | mesmo canal, `SendInputString` com o texto em base64 |
| Abrir app | mesmo canal, evento `ed.apps.launch` |
| YouTube | `POST http://IP:8080/ws/apps/YouTube` com `list=UU...` |
