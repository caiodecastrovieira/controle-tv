import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Key, Row } from '../components/Key';
import { Sheet } from '../components/Sheet';
import { saveTV } from '../lib/storage';
import { probe, scanNetwork, type FoundTV } from '../tv/discovery';
import { tv, useTV } from '../tv/SamsungTV';
import { c, radius } from '../theme';

export function ConnectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const state = useTV();
  const [found, setFound] = useState<FoundTV[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [ip, setIp] = useState('');
  const stop = useRef(false);

  const scan = async () => {
    stop.current = false;
    setFound([]);
    setScanError(null);
    setScanning(true);
    setProgress(0);
    try {
      await scanNetwork(
        (t) => setFound((prev) => (prev.some((p) => p.ip === t.ip) ? prev : [...prev, t])),
        () => stop.current,
        setProgress,
      );
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (visible && state.status !== 'connected' && !scanning) scan();
    if (!visible) stop.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Conectou: fecha sozinho.
  useEffect(() => {
    if (visible && state.status === 'connected') {
      stop.current = true;
      const t = setTimeout(onClose, 700);
      return () => clearTimeout(t);
    }
  }, [state.status, visible, onClose]);

  const pick = (t: FoundTV) => {
    stop.current = true;
    tv.connect({ ip: t.ip, name: t.name });
  };

  const manual = async () => {
    const clean = ip.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
      setScanError('Digite um IP no formato 192.168.0.10');
      return;
    }
    const info = await probe(clean, 2500);
    tv.connect({ ip: clean, name: info?.name ?? 'TV Samsung' });
  };

  const forget = () => {
    tv.disconnect();
    saveTV(null);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Conectar à TV">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
        <StatusCard />

        {state.status === 'connected' ? (
          <Row>
            <Key onPress={() => tv.disconnect()} label="Desconectar" />
            <Key onPress={forget} tone="danger" label="Esquecer TV" />
          </Row>
        ) : (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.section}>TVs na sua rede</Text>
              {scanning ? (
                <Text style={styles.progress}>{Math.round(progress * 100)}%</Text>
              ) : (
                <Pressable onPress={scan} hitSlop={10}>
                  <Text style={styles.link}>Procurar de novo</Text>
                </Pressable>
              )}
            </View>

            {found.map((t) => (
              <Pressable
                key={t.ip}
                onPress={() => pick(t)}
                style={({ pressed }) => [styles.tvRow, pressed && { backgroundColor: c.surfaceHi }]}
              >
                <Ionicons name="tv-outline" size={22} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tvName}>{t.name}</Text>
                  <Text style={styles.tvMeta}>
                    {t.ip}
                    {t.model ? ` · ${t.model}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
            ))}

            {scanning && !found.length && <ActivityIndicator color={c.accent} style={{ marginVertical: 8 }} />}
            {!scanning && !found.length && !scanError && (
              <Text style={styles.muted}>Nenhuma TV encontrada. Ela está ligada e no mesmo Wi-Fi?</Text>
            )}
            {scanError && <Text style={styles.error}>{scanError}</Text>}

            <Text style={[styles.section, { marginTop: 8 }]}>Ou digite o IP da TV</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={ip}
                onChangeText={setIp}
                placeholder="192.168.0.10"
                placeholderTextColor={c.faint}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Key onPress={manual} tone="accent" label="Conectar" style={{ flex: 0, width: 120 }} />
            </View>
            <Text style={styles.tip}>
              Na TV: Configurações › Geral › Rede › Status da rede › Configurações de IP.
            </Text>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

function StatusCard() {
  const { status, name, ip, error } = useTV();
  const map = {
    idle: { color: c.faint, title: 'Nenhuma TV conectada', sub: 'Escolha uma TV abaixo.' },
    connecting: { color: c.warn, title: `Conectando em ${name ?? ip}`, sub: ip },
    'waiting-permission': {
      color: c.warn,
      title: 'Olhe para a TV',
      sub: 'Ela está pedindo permissão. Escolha "Permitir" com o controle original. É só na primeira vez.',
    },
    connected: { color: c.accent, title: name ?? 'TV Samsung', sub: `Conectado · ${ip}` },
    error: { color: c.danger, title: 'Não deu certo', sub: error },
  }[status];

  return (
    <View style={styles.status}>
      {status === 'connecting' ? (
        <ActivityIndicator size="small" color={map.color} />
      ) : (
        <View style={[styles.statusDot, { backgroundColor: map.color }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.statusTitle}>{map.title}</Text>
        {!!map.sub && <Text style={styles.statusSub}>{map.sub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  statusSub: { color: c.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  progress: { color: c.muted, fontSize: 13 },
  link: { color: c.accent, fontSize: 14, fontWeight: '600' },
  tvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
  },
  tvName: { color: c.text, fontSize: 15, fontWeight: '600' },
  tvMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  muted: { color: c.muted, fontSize: 14 },
  error: { color: c.danger, fontSize: 14 },
  input: {
    flex: 1,
    color: c.text,
    fontSize: 16,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    height: 58,
  },
  tip: { color: c.faint, fontSize: 12, lineHeight: 17 },
});
