import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Share, StyleSheet, Text } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import { NetworkError } from '../src/api/client';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { tr } from '../src/i18n/tr';
import { api } from '../src/session';
import {
  categoryNames,
  exportFileName,
  exportText,
  shareStatusText,
  type WalletDto,
} from '../src/wallet/model';

const t = tr.wallet;

/** Web'de dosya olarak indirir; cihazda paylaşım penceresini açar. */
async function deliver(name: string, text: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: name, message: text });
}

export default function WalletScreen() {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setWallet(await api.wallet());
      setError(null);
    } catch (e) {
      setError(e instanceof NetworkError ? t.offline : t.error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setInfo(null);
    try {
      const data = await api.exportData();
      await deliver(exportFileName(new Date()), exportText(data));
      setInfo(t.downloaded);
    } catch (e) {
      setError(e instanceof NetworkError ? t.offline : t.error);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.revokeShare(id);
      await load();
    } catch {
      setError(t.error);
    }
  };

  const now = Date.now();
  return (
    <FlowScreen footer={<Button label={t.download} onPress={() => void download()} />}>
      <FlowHeader />
      <Text accessibilityRole="header" style={styles.title}>
        {t.title}
      </Text>
      <Text style={styles.muted}>{t.intro}</Text>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {info ? <Notice>{info}</Notice> : null}

      {wallet?.categories.map((c) => (
        <Card key={c.key} style={styles.row}>
          <Text style={styles.name}>{c.label}</Text>
          <Text style={styles.muted}>
            {c.count} {t.records}
          </Text>
        </Card>
      ))}

      {wallet ? (
        <>
          <Text style={styles.section}>{t.sharesTitle}</Text>
          {wallet.given.length === 0 ? <Text style={styles.muted}>{t.noShares}</Text> : null}
          {wallet.given.map((s) => (
            <Card key={s.id} style={{ gap: spacing.sm }}>
              <Text style={styles.name}>{s.purpose}</Text>
              <Text style={styles.muted}>{categoryNames(s.categories, wallet.categories)}</Text>
              <Text style={styles.muted}>{shareStatusText(s, now)}</Text>
              {s.active ? (
                <Button label={t.revoke} variant="danger" onPress={() => void revoke(s.id)} />
              ) : null}
            </Card>
          ))}
          <Text style={styles.section}>{t.receivedTitle}</Text>
          {wallet.received.length === 0 ? <Text style={styles.muted}>{t.noReceived}</Text> : null}
          {wallet.received.map((s) => (
            <Card key={s.id}>
              <Text style={styles.name}>{s.purpose}</Text>
              <Text style={styles.muted}>{shareStatusText(s, now)}</Text>
            </Card>
          ))}
          <Card style={{ gap: spacing.xs }}>
            <Text style={styles.muted}>{t.shareIdHint}</Text>
            <Text style={styles.name}>{t.shareId}</Text>
            <Text selectable style={styles.muted}>
              {wallet.shareId}
            </Text>
          </Card>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, color: colors.forest },
  section: { fontFamily: fontFamily.extrabold, fontSize: 22, color: colors.forest, marginTop: 8 },
  row: { gap: 2 },
  name: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
});
