import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadTV } from './src/lib/storage';
import { ChannelsScreen } from './src/screens/ChannelsScreen';
import { ConnectSheet } from './src/screens/ConnectSheet';
import { KeyboardScreen } from './src/screens/KeyboardScreen';
import { RemoteScreen } from './src/screens/RemoteScreen';
import { tv, useTV } from './src/tv/SamsungTV';
import { c, radius } from './src/theme';

type Tab = 'remote' | 'keyboard' | 'channels';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'remote', label: 'Controle', icon: 'radio-button-on-outline' },
  { id: 'keyboard', label: 'Teclado', icon: 'keypad-outline' },
  { id: 'channels', label: 'Canais', icon: 'logo-youtube' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('remote');
  const [connectOpen, setConnectOpen] = useState(false);
  const closeConnect = useCallback(() => setConnectOpen(false), []);

  // Reconecta na última TV ao abrir o app.
  useEffect(() => {
    loadTV().then((saved) => {
      if (saved) tv.connect(saved);
      else setConnectOpen(true);
    });
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tv.wake());
    return () => sub.remove();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header onPress={() => setConnectOpen(true)} />

      <View style={{ flex: 1 }}>
        {tab === 'remote' && <RemoteScreen />}
        {tab === 'keyboard' && <KeyboardScreen />}
        {tab === 'channels' && <ChannelsScreen />}
      </View>

      <View style={[styles.tabs, { paddingBottom: insets.bottom + 8 }]}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={styles.tab} accessibilityRole="tab">
              <Ionicons name={t.icon as any} size={22} color={active ? c.accent : c.faint} />
              <Text style={[styles.tabLabel, active && { color: c.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ConnectSheet visible={connectOpen} onClose={closeConnect} />
    </View>
  );
}

function Header({ onPress }: { onPress: () => void }) {
  const { status, name } = useTV();
  const color =
    status === 'connected' ? c.accent : status === 'error' ? c.danger : status === 'idle' ? c.faint : c.warn;
  const label =
    status === 'connected'
      ? name ?? 'TV Samsung'
      : status === 'connecting'
        ? 'Conectando...'
        : status === 'waiting-permission'
          ? 'Aceite na TV'
          : 'Conectar TV';

  return (
    <View style={styles.header}>
      <Text style={styles.brand}>Controle</Text>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.pillText} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={14} color={c.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brand: { color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 220,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: c.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.bg,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  tabLabel: { color: c.faint, fontSize: 12, fontWeight: '600' },
});
