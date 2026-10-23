import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Key, Row } from '../components/Key';
import { Sheet } from '../components/Sheet';
import { tv, type InstalledApp } from '../tv/SamsungTV';
import { c, radius } from '../theme';

const I = ({ name, size = 22, color = c.text }: { name: any; size?: number; color?: string }) => (
  <Ionicons name={name} size={size} color={color} />
);

export function RemoteScreen() {
  const [numpad, setNumpad] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Row>
        <Key code="KEY_POWER" tone="danger" a11y="Desligar">
          <I name="power" color={c.danger} />
        </Key>
        <Key code="KEY_SOURCE" a11y="Fonte">
          <MaterialCommunityIcons name="video-input-hdmi" size={22} color={c.text} />
        </Key>
        <Key onPress={() => setNumpad(true)} a11y="Números e cores">
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.small}>1 2 3</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[c.red, c.green, c.yellow, c.blue].map((col) => (
                <View key={col} style={[styles.dot, { backgroundColor: col }]} />
              ))}
            </View>
          </View>
        </Key>
      </Row>

      <Row>
        <Key code="KEY_INFO" a11y="Informações">
          <I name="information-circle-outline" />
        </Key>
        <Key code="KEY_GUIDE" label="Guia" />
        <Key code="KEY_MENU" label="Menu" />
      </Row>

      {/* Volume | Direcional | Canal */}
      <View style={styles.pad}>
        <Rocker up="KEY_VOLUP" down="KEY_VOLDOWN" label="VOL" />
        <DPad />
        <Rocker up="KEY_CHUP" down="KEY_CHDOWN" label="CH" />
      </View>

      <Row>
        <Key code="KEY_RETURN" a11y="Voltar">
          <I name="arrow-undo-outline" />
        </Key>
        <Key code="KEY_HOME" a11y="Início">
          <I name="home-outline" />
        </Key>
        <Key code="KEY_MUTE" a11y="Mudo">
          <I name="volume-mute-outline" />
        </Key>
        <Key code="KEY_EXIT" a11y="Sair">
          <I name="exit-outline" />
        </Key>
      </Row>

      <Row>
        <Key code="KEY_REWIND" repeat a11y="Retroceder">
          <I name="play-back-outline" size={20} />
        </Key>
        <Key code="KEY_PLAY" a11y="Reproduzir">
          <I name="play-outline" size={20} />
        </Key>
        <Key code="KEY_PAUSE" a11y="Pausar">
          <I name="pause-outline" size={20} />
        </Key>
        <Key code="KEY_FF" repeat a11y="Avançar">
          <I name="play-forward-outline" size={20} />
        </Key>
      </Row>

      <Text style={styles.section}>Apps</Text>
      <Row>
        <Key onPress={() => tv.openApp('netflix').catch(() => {})} label="Netflix" />
        <Key onPress={() => tv.openApp('prime').catch(() => {})} label="Prime" />
        <Key onPress={() => tv.openApp('youtube').catch(() => {})} label="YouTube" />
        <Key onPress={() => setAppsOpen(true)} a11y="Todos os apps">
          <I name="apps-outline" size={20} />
        </Key>
      </Row>

      <Sheet visible={numpad} onClose={() => setNumpad(false)} title="Números e cores">
        <Numpad />
      </Sheet>

      <Sheet visible={appsOpen} onClose={() => setAppsOpen(false)} title="Apps instalados">
        <AppsList onPicked={() => setAppsOpen(false)} />
      </Sheet>
    </ScrollView>
  );
}

function Rocker({ up, down, label }: { up: string; down: string; label: string }) {
  return (
    <View style={styles.rocker}>
      <Key code={up} repeat tone="ghost" style={styles.rockerKey} a11y={`${label} mais`}>
        <I name="add" size={26} />
      </Key>
      <Text style={styles.rockerLabel}>{label}</Text>
      <Key code={down} repeat tone="ghost" style={styles.rockerKey} a11y={`${label} menos`}>
        <I name="remove" size={26} />
      </Key>
    </View>
  );
}

function DPad() {
  const arrow = (code: string, icon: string, pos: object, a11y: string) => (
    <Key code={code} repeat tone="ghost" style={[styles.arrow, pos]} a11y={a11y}>
      <I name={icon} size={24} color={c.muted} />
    </Key>
  );
  return (
    <View style={styles.dpad}>
      {arrow('KEY_UP', 'chevron-up', { top: 6, left: 63 }, 'Cima')}
      {arrow('KEY_DOWN', 'chevron-down', { bottom: 6, left: 63 }, 'Baixo')}
      {arrow('KEY_LEFT', 'chevron-back', { left: 6, top: 63 }, 'Esquerda')}
      {arrow('KEY_RIGHT', 'chevron-forward', { right: 6, top: 63 }, 'Direita')}
      <Key code="KEY_ENTER" style={styles.ok} label="OK" />
    </View>
  );
}

function Numpad() {
  const n = (d: string) => <Key key={d} code={`KEY_${d}`} label={d} />;
  return (
    <View style={{ gap: 10 }}>
      <Row>{['1', '2', '3'].map(n)}</Row>
      <Row>{['4', '5', '6'].map(n)}</Row>
      <Row>{['7', '8', '9'].map(n)}</Row>
      <Row>
        <Key code="KEY_PRECH" label="Anterior" />
        {n('0')}
        <Key code="KEY_CH_LIST" label="Lista" />
      </Row>
      <Row>
        {[
          ['KEY_RED', c.red],
          ['KEY_GREEN', c.green],
          ['KEY_YELLOW', c.yellow],
          ['KEY_CYAN', c.blue],
        ].map(([code, col]) => (
          <Key key={code} code={code} style={{ height: 44 }} a11y={code}>
            <View style={[styles.colorBar, { backgroundColor: col }]} />
          </Key>
        ))}
      </Row>
    </View>
  );
}

function AppsList({ onPicked }: { onPicked: () => void }) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tv.getInstalledApps().then(setApps, (e) => setError(e.message));
  }, []);

  if (error) return <Text style={styles.muted}>{error}</Text>;
  if (!apps) return <ActivityIndicator color={c.accent} style={{ marginVertical: 24 }} />;
  if (!apps.length) return <Text style={styles.muted}>A TV não informou nenhum app.</Text>;

  return (
    <FlatList
      data={apps}
      keyExtractor={(a) => a.appId}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border }} />}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.appRow, pressed && { opacity: 0.6 }]}
          onPress={() => {
            tv.launchById(item.appId).catch(() => {});
            onPicked();
          }}
        >
          <Text style={styles.appName}>{item.name}</Text>
          <Ionicons name="open-outline" size={18} color={c.muted} />
        </Pressable>
      )}
    />
  );
}

const DPAD = 190;

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  small: { color: c.text, fontSize: 13, fontWeight: '600', letterSpacing: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginVertical: 4,
  },
  rocker: {
    width: 64,
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: radius.pill,
    paddingVertical: 6,
  },
  rockerKey: { flex: 0, width: 56, height: 64 },
  rockerLabel: { color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginVertical: 6 },
  dpad: {
    width: DPAD,
    height: DPAD,
    borderRadius: DPAD / 2,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
  },
  arrow: { position: 'absolute', flex: 0, width: 64, height: 64, borderRadius: 32 },
  ok: {
    position: 'absolute',
    flex: 0,
    width: 76,
    height: 76,
    borderRadius: 38,
    top: (DPAD - 2 - 76) / 2,
    left: (DPAD - 2 - 76) / 2,
    backgroundColor: c.surfaceHi,
  },
  section: { color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginTop: 8, textTransform: 'uppercase' },
  colorBar: { width: 28, height: 6, borderRadius: 3 },
  muted: { color: c.muted, fontSize: 14, marginVertical: 16 },
  appRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  appName: { color: c.text, fontSize: 15 },
});
