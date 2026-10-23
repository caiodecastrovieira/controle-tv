import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { loadChannels, saveChannels, type Channel } from '../lib/storage';
import { resolveChannel, uploadsPlaylist } from '../lib/youtube';
import { tv, useTV } from '../tv/SamsungTV';
import { c, radius } from '../theme';

export function ChannelsScreen() {
  const { status } = useTV();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    loadChannels().then(setChannels);
  }, []);

  const update = (list: Channel[]) => {
    setChannels(list);
    saveChannels(list);
  };

  const add = async () => {
    if (!input.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const ch = await resolveChannel(input);
      if (channels.some((x) => x.id === ch.id)) {
        setError(`${ch.title} já está na lista.`);
      } else {
        update([ch, ...channels]);
        setInput('');
      }
    } catch (e: any) {
      setError(e.message ?? 'Não consegui adicionar esse canal.');
    } finally {
      setAdding(false);
    }
  };

  const play = async (ch: Channel) => {
    if (status !== 'connected') {
      setError('Conecte a TV primeiro.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPlaying(ch.id);
    setError(null);
    try {
      await tv.playYouTube({ list: uploadsPlaylist(ch.id) });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTimeout(() => setPlaying(null), 1200);
    }
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

  return (
    <FlatList
      data={channels}
      keyExtractor={(ch) => ch.id}
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          <View style={styles.addRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={add}
              placeholder="@canal ou link do YouTube"
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              style={styles.input}
            />
            <Pressable
              onPress={add}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Adicionar canal"
            >
              {adding ? <ActivityIndicator color={c.accentInk} /> : <Ionicons name="add" size={26} color={c.accentInk} />}
            </Pressable>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          {channels.length > 0 && (
            <Text style={styles.tip}>Toque para tocar os vídeos mais recentes na TV. Segure para remover.</Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="logo-youtube" size={40} color={c.faint} />
          <Text style={styles.emptyTitle}>Seus canais favoritos aqui</Text>
          <Text style={styles.emptyText}>
            Cole o link de um canal, um @ (como @canal) ou até o link de um vídeo. O app descobre o canal sozinho.
          </Text>
        </View>
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
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {index > 0 && (
            <Pressable onPress={() => moveUp(item)} hitSlop={10} accessibilityLabel="Subir na lista">
              <Ionicons name="arrow-up" size={18} color={c.faint} />
            </Pressable>
          )}
          <View style={styles.playBtn}>
            {playing === item.id ? (
              <ActivityIndicator size="small" color={c.accent} />
            ) : (
              <Ionicons name="play" size={18} color={c.accent} />
            )}
          </View>
        </Pressable>
      )}
    />
  );
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
  title: { color: c.text, fontSize: 16, fontWeight: '600', flex: 1 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(61,220,151,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
