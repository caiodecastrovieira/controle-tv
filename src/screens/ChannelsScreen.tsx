import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { loadChannels, saveChannels, type Channel } from '../lib/storage';
import {
  fetchRecentVideos,
  looksLikeChannelRef,
  resolveChannel,
  searchChannels,
  thumb,
  type ChannelResult,
  type Video,
} from '../lib/youtube';
import { loadScreen, pairViaDial, pairWithCode, playVideo, saveScreen, type Screen } from '../lib/lounge';
import { Sheet } from '../components/Sheet';
import { tv, useTV } from '../tv/SamsungTV';
import { c, radius } from '../theme';

export function ChannelsScreen() {
  const { status } = useTV();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ChannelResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Channel | null>(null);
  const searchId = useRef(0);

  useEffect(() => {
    loadChannels().then(setChannels);
  }, []);

  const update = (list: Channel[]) => {
    setChannels(list);
    saveChannels(list);
  };

  const runSearch = async (q: string) => {
    const query = q.trim();
    const my = ++searchId.current;
    if (!query) {
      setResults(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (looksLikeChannelRef(query)) {
        const ch = await resolveChannel(query);
        if (my === searchId.current) setResults([{ id: ch.id, title: ch.title, avatar: ch.avatar }]);
      } else {
        const list = await searchChannels(query);
        if (my !== searchId.current) return;
        setResults(list);
        if (!list.length) setError('Nenhum canal encontrado.');
      }
    } catch (e: any) {
      if (my === searchId.current) setError(e.message ?? 'A busca falhou.');
    } finally {
      if (my === searchId.current) setBusy(false);
    }
  };

  // Busca enquanto digita, com uma pequena pausa.
  useEffect(() => {
    const t = setTimeout(() => runSearch(input), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const add = (r: ChannelResult) => {
    if (channels.some((x) => x.id === r.id)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    update([{ id: r.id, title: r.title, avatar: r.avatar, addedAt: Date.now() }, ...channels]);
  };

  const clear = () => {
    setInput('');
    setResults(null);
    setError(null);
  };

  const play = (ch: Channel) => {
    if (status !== 'connected') {
      setError('Conecte a TV primeiro.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setError(null);
    setOpen(ch);
  };

  const remove = (ch: Channel) =>
    Alert.alert('Remover canal', `Tirar ${ch.title} da lista?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => update(channels.filter((x) => x.id !== ch.id)) },
    ]);

  const moveUp = (ch: Channel) => {
    const i = channels.findIndex((x) => x.id === ch.id);
    if (i <= 0) return;
    const next = [...channels];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    update(next);
  };

  const searching = input.trim().length > 0;

  return (
    <>
      <FlatList
        data={searching ? [] : channels}
        keyExtractor={(ch) => ch.id}
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <View style={styles.search}>
              <Ionicons name="search" size={20} color={c.muted} />
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => runSearch(input)}
                placeholder="Buscar canal"
                placeholderTextColor={c.faint}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {busy ? (
                <ActivityIndicator color={c.muted} />
              ) : searching ? (
                <Pressable onPress={clear} hitSlop={10} accessibilityLabel="Limpar busca">
                  <Ionicons name="close-circle" size={20} color={c.muted} />
                </Pressable>
              ) : null}
            </View>
            {error && <Text style={styles.error}>{error}</Text>}

            {searching &&
              results?.map((r) => {
                const added = channels.some((x) => x.id === r.id);
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => add(r)}
                    disabled={added}
                    style={({ pressed }) => [styles.card, pressed && { backgroundColor: c.surfaceHi }]}
                  >
                    {r.avatar ? (
                      <Image source={{ uri: r.avatar }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: c.surfaceHi }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} numberOfLines={1}>
                        {r.title}
                      </Text>
                      {r.info && (
                        <Text style={styles.videoMeta} numberOfLines={1}>
                          {r.info}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.playBtn, added && { backgroundColor: 'transparent' }]}>
                      <Ionicons name={added ? 'checkmark' : 'add'} size={22} color={added ? c.muted : c.accent} />
                    </View>
                  </Pressable>
                );
              })}

            {!searching && channels.length > 0 && (
              <Text style={styles.tip}>Toque para ver os vídeos recentes. Segure para remover.</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          searching ? undefined : (
            <View style={styles.empty}>
              <Ionicons name="logo-youtube" size={40} color={c.faint} />
              <Text style={styles.emptyTitle}>Seus canais favoritos aqui</Text>
              <Text style={styles.emptyText}>Busque pelo nome do canal e toque no + para adicionar.</Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => play(item)}
            onLongPress={() => remove(item)}
            style={({ pressed }) => [styles.card, pressed && { backgroundColor: c.surfaceHi }]}
          >
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: c.surfaceHi }]} />
            )}
            <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
              {item.title}
            </Text>
            {index > 0 && (
              <Pressable onPress={() => moveUp(item)} hitSlop={10} accessibilityLabel="Subir na lista">
                <Ionicons name="arrow-up" size={18} color={c.faint} />
              </Pressable>
            )}
            <View style={styles.playBtn}>
              <Ionicons name="play" size={18} color={c.accent} />
            </View>
          </Pressable>
        )}
      />
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && <VideoList channel={open} onDone={() => setOpen(null)} />}
      </Sheet>
    </>
  );
}

function VideoList({ channel, onDone }: { channel: Channel; onDone: () => void }) {
  const { ip } = useTV();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen | null | undefined>(undefined);
  const [pending, setPending] = useState<Video | null>(null);

  useEffect(() => {
    fetchRecentVideos(channel.id).then(setVideos, (e) => setError(e.message));
    loadScreen().then(setScreen);
  }, [channel.id]);

  const send = async (v: Video, scr = screen) => {
    if (!scr) {
      setPending(v);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSending(v.id);
    setError(null);
    try {
      await tv.ensureYouTubeOpen();
      setScreen(await playVideo(scr, v.id));
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(null);
    }
  };

  if (pending) {
    return (
      <LinkYouTube
        ip={ip}
        onLinked={(scr) => {
          setScreen(scr);
          const v = pending;
          setPending(null);
          if (v) send(v, scr);
        }}
        onCancel={() => setPending(null)}
      />
    );
  }

  if (error && !videos) return <Text style={styles.error}>{error}</Text>;
  if (!videos || screen === undefined) return <ActivityIndicator color={c.accent} style={{ marginVertical: 32 }} />;

  return (
    <FlatList
      data={videos}
      keyExtractor={(v) => v.id}
      ListHeaderComponent={error ? <Text style={[styles.error, { marginBottom: 12 }]}>{error}</Text> : undefined}
      ListFooterComponent={
        screen ? (
          <Pressable
            onPress={() => {
              saveScreen(null);
              setScreen(null);
            }}
            hitSlop={10}
            style={{ marginTop: 20, alignSelf: 'center' }}
          >
            <Text style={styles.tip}>Desvincular YouTube da TV</Text>
          </Pressable>
        ) : undefined
      }
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => send(item)}
          disabled={!!sending}
          style={({ pressed }) => [styles.video, pressed && { opacity: 0.7 }]}
        >
          <View>
            <Image source={{ uri: thumb(item.id) }} style={styles.thumb} />
            {sending === item.id && (
              <View style={styles.thumbOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {index === 0 && <Text style={styles.badge}>MAIS RECENTE</Text>}
            <Text style={styles.videoTitle} numberOfLines={3}>
              {item.title}
            </Text>
            {(item.published || item.when) && (
              <Text style={styles.videoMeta}>{item.published ? ago(item.published) : item.when}</Text>
            )}
          </View>
        </Pressable>
      )}
    />
  );
}

/** Vínculo único entre o app e o YouTube da TV. */
function LinkYouTube({
  ip,
  onLinked,
  onCancel,
}: {
  ip?: string;
  onLinked: (s: Screen) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'auto' | 'code' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const auto = async () => {
    if (!ip) return setError('Conecte a TV primeiro.');
    setBusy('auto');
    setError(null);
    try {
      await tv.ensureYouTubeOpen();
      onLinked(await pairViaDial(ip));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const manual = async () => {
    setBusy('code');
    setError(null);
    try {
      onLinked(await pairWithCode(code));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
      <Text style={styles.linkTitle}>Vincular o YouTube da TV</Text>
      <Text style={styles.emptyText}>
        É só uma vez. Depois disso, tocar num vídeo abre ele direto na TV.
      </Text>

      <Pressable
        onPress={auto}
        disabled={!!busy}
        style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}
      >
        {busy === 'auto' ? (
          <ActivityIndicator color={c.accentInk} />
        ) : (
          <Text style={styles.primaryText}>Vincular automaticamente</Text>
        )}
      </Pressable>

      <Text style={[styles.videoMeta, { marginTop: 6 }]}>
        Se não der certo: no YouTube da TV, vá em Configurações › Vincular com código de TV e digite os 12
        números aqui.
      </Text>
      <View style={styles.addRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="000 000 000 000"
          placeholderTextColor={c.faint}
          keyboardType="number-pad"
          maxLength={15}
          style={styles.input}
        />
        <Pressable
          onPress={manual}
          disabled={!!busy}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Vincular com código"
        >
          {busy === 'code' ? (
            <ActivityIndicator color={c.accentInk} />
          ) : (
            <Ionicons name="checkmark" size={24} color={c.accentInk} />
          )}
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable onPress={onCancel} hitSlop={10} style={{ alignSelf: 'center', marginTop: 4 }}>
        <Text style={styles.tip}>Voltar para os vídeos</Text>
      </Pressable>
    </ScrollView>
  );
}

function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `há ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 86400) return `há ${Math.round(d / 3600)} h`;
  const days = Math.round(d / 86400);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  const months = Math.round(days / 30);
  return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 32 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    color: c.text,
    fontSize: 16,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    height: 54,
  },
  addBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: c.danger, fontSize: 14 },
  tip: { color: c.faint, fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: c.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  title: { color: c.text, fontSize: 16, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    height: 54,
  },
  searchInput: { flex: 1, color: c.text, fontSize: 16, height: '100%' },
  video: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 140, height: 79, borderRadius: 10, backgroundColor: c.surfaceHi },
  thumbOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
  primary: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
  formatBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatText: { color: c.accent, fontSize: 13, fontWeight: '700' },
  badge: { color: c.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  videoTitle: { color: c.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  videoMeta: { color: c.muted, fontSize: 12 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(61,220,151,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
