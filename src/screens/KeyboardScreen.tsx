import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { Key, Row } from '../components/Key';
import { tv, useTV } from '../tv/SamsungTV';
import { c, radius } from '../theme';

export function KeyboardScreen() {
  const { status, imeOpen, imeText } = useTV();
  const [text, setText] = useState('');
  const lastSent = useRef('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<TextInputInstance>(null);

  // Quando a TV abre um campo, puxa o texto que já está lá.
  useEffect(() => {
    if (imeOpen && imeText !== lastSent.current) {
      setText(imeText);
      lastSent.current = imeText;
    }
  }, [imeOpen, imeText]);

  // Abriu o campo na TV: já foca o teclado do celular.
  useEffect(() => {
    if (imeOpen) input.current?.focus();
  }, [imeOpen]);

  const onChange = (value: string) => {
    setText(value);
    if (debounce.current) clearTimeout(debounce.current);
    // Espelha na TV enquanto você digita.
    debounce.current = setTimeout(() => {
      lastSent.current = value;
      tv.typeText(value);
    }, 150);
  };

  const submit = () => {
    if (debounce.current) clearTimeout(debounce.current);
    tv.typeText(text);
    tv.finishText();
    lastSent.current = '';
    setText('');
  };

  const clear = () => onChange('');

  const connected = status === 'connected';
  const hint = !connected
    ? { icon: 'cloud-offline-outline', color: c.faint, text: 'Conecte a TV para digitar.' }
    : imeOpen
      ? { icon: 'checkmark-circle', color: c.accent, text: 'Campo aberto na TV. O que você digitar aparece lá.' }
      : {
          icon: 'tv-outline',
          color: c.warn,
          text: 'Abra um campo de busca ou login na TV. O texto só aparece quando o teclado da TV está na tela.',
        };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.hint}>
          <Ionicons name={hint.icon as any} size={18} color={hint.color} />
          <Text style={styles.hintText}>{hint.text}</Text>
        </View>

        <TextInput
          ref={input}
          value={text}
          onChangeText={onChange}
          onSubmitEditing={submit}
          placeholder="Digite aqui"
          placeholderTextColor={c.faint}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="send"
          editable={connected}
          multiline={false}
        />

        <Row>
          <Key onPress={clear} label="Apagar tudo" />
          <Key onPress={submit} tone="accent" label="Enviar" />
        </Row>

        <Text style={styles.section}>Navegar sem sair desta tela</Text>
        <Row>
          <Key code="KEY_LEFT" a11y="Esquerda">
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Key>
          <Key code="KEY_UP" a11y="Cima">
            <Ionicons name="chevron-up" size={22} color={c.text} />
          </Key>
          <Key code="KEY_DOWN" a11y="Baixo">
            <Ionicons name="chevron-down" size={22} color={c.text} />
          </Key>
          <Key code="KEY_RIGHT" a11y="Direita">
            <Ionicons name="chevron-forward" size={22} color={c.text} />
          </Key>
        </Row>
        <Row>
          <Key code="KEY_RETURN" label="Voltar" />
          <Key code="KEY_ENTER" label="OK" />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  hint: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
  },
  hintText: { color: c.muted, fontSize: 14, lineHeight: 20, flex: 1 },
  input: {
    color: c.text,
    fontSize: 20,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    height: 64,
  },
  section: {
    color: c.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 8,
    textTransform: 'uppercase',
  },
});
