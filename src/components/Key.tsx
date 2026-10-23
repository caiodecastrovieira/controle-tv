import * as Haptics from 'expo-haptics';
import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { tv } from '../tv/SamsungTV';
import { c, radius } from '../theme';

type Props = {
  /** Código da tecla Samsung (ex.: KEY_VOLUP). Se vier onPress, ele tem prioridade. */
  code?: string;
  onPress?: () => void;
  /** Repete enquanto o dedo estiver pressionando (volume, canal, setas). */
  repeat?: boolean;
  label?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'danger' | 'ghost' | 'accent';
  a11y?: string;
};

export function Key({ code, onPress, repeat, label, children, style, tone = 'default', a11y }: Props) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);

  const fire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onPress) onPress();
    else if (code) tv.key(code);
  };

  const stop = () => {
    if (hold.current) clearTimeout(hold.current);
    if (loop.current) clearInterval(loop.current);
    hold.current = loop.current = null;
  };

  useEffect(() => stop, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPressIn={() => {
        fire();
        if (repeat) hold.current = setTimeout(() => (loop.current = setInterval(fire, 110)), 380);
      }}
      onPressOut={stop}
      style={({ pressed }) => [
        styles.base,
        tone === 'danger' && styles.danger,
        tone === 'ghost' && styles.ghost,
        tone === 'accent' && styles.accent,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children ?? (
        <Text style={[styles.label, tone === 'accent' && { color: c.accentInk }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Row({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', gap }}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: { backgroundColor: '#2A1416', borderColor: '#4A2023' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  accent: { backgroundColor: c.accent, borderColor: c.accent },
  pressed: { backgroundColor: c.surfaceHi, transform: [{ scale: 0.96 }] },
  label: { color: c.text, fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
});
