import type { CommandDto, DeviceStatusDto } from '@tarim/schemas';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, radius, spacing } from '@tarim/ui';
import { ApiError, NetworkError, type DeviceDto } from '../src/api/client';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { Icon } from '../src/components/Icon';
import { tr } from '../src/i18n/tr';
import {
  DEFAULT_DURATION,
  DURATIONS,
  buildTimeline,
  failText,
  newIdempotencyKey,
  phaseOf,
  remainingMinutes,
  whenText,
  type StepState,
} from '../src/irrigation/model';
import { api } from '../src/session';

const t = tr.irrigation;
const POLL_MS = 2500;

function errorMessage(e: unknown): string {
  if (e instanceof NetworkError) return t.netError;
  if (e instanceof ApiError) {
    if (e.status === 403) return t.noAccess;
    if (e.status === 409) return t.busy;
  }
  return t.error;
}

const stepColor: Record<StepState, string> = {
  done: colors.forest,
  active: colors.water,
  pending: colors.border,
  failed: colors.brick,
};

export default function IrrigationScreen() {
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  const [device, setDevice] = useState<DeviceDto | null | undefined>(undefined);
  const [status, setStatus] = useState<DeviceStatusDto | null>(null);
  const [command, setCommand] = useState<CommandDto | null>(null);
  const [now, setNow] = useState(Date.now());
  const [asking, setAsking] = useState(false);
  const [minutes, setMinutes] = useState<number>(DEFAULT_DURATION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoNote, setAutoNote] = useState(false);
  const deviceRef = useRef<DeviceDto | null>(null);

  const refresh = useCallback(async () => {
    const d = deviceRef.current;
    if (!d) return;
    try {
      const s = await api.deviceStatus(d.id);
      setStatus(s);
      setCommand(s.lastCommand);
      setNow(Date.now());
    } catch {
      // Ağ yoksa son bilinen durum kalır; yenisi gelene kadar yanlış "kapalı" gösterilmez.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          const all = await api.devices();
          const d = all.find((x) => x.id === deviceId) ?? all[0] ?? null;
          if (!alive) return;
          deviceRef.current = d;
          setDevice(d);
          await refresh();
        } catch {
          if (alive) setDevice(null);
        }
      })();
      return () => {
        alive = false;
      };
    }, [deviceId, refresh]),
  );

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const phase = phaseOf(status, now);
  const steps = buildTimeline(command, status, now);
  const showSteps =
    steps.length > 0 && (phase === 'waiting' || phase === 'running' || phase === 'failed');

  const send = async (action: 'open' | 'close') => {
    if (!device || busy) return;
    setBusy(true);
    setError(null);
    setAsking(false);
    try {
      const c = await api.sendCommand(device.id, {
        action,
        ...(action === 'open' ? { minutes } : {}),
        idempotencyKey: newIdempotencyKey(),
      });
      setCommand(c);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (device === null) {
    return (
      <FlowScreen>
        <FlowHeader />
        <Text style={styles.big}>{t.noDevice}</Text>
        <Text style={styles.muted}>{t.noDeviceHint}</Text>
      </FlowScreen>
    );
  }

  const running = phase === 'running';
  const stoppable = running || phase === 'waiting';
  const title = running ? t.running : phase === 'unknown' ? t.unknown : t.closed;
  const sub = running
    ? t.remaining.replace('{{min}}', String(remainingMinutes(status!, now)))
    : phase === 'unknown'
      ? t.unknownHint
      : status?.lastRun
        ? t.lastRun
            .replace('{{when}}', whenText(status.lastRun.at, now))
            .replace('{{min}}', String(status.lastRun.minutes))
        : t.noRun;

  return (
    <>
      <FlowScreen
        footer={
          <>
            <View style={styles.auditRow}>
              <Icon name="warning" size={18} color={colors.textMuted} />
              <Text style={styles.audit}>{t.audit}</Text>
            </View>
            {stoppable ? (
              <Button label={t.stop} variant="danger" onPress={() => void send('close')} />
            ) : (
              <Button
                label={t.start}
                variant="water"
                onPress={() => {
                  setError(null);
                  setAsking(true);
                }}
              />
            )}
          </>
        }
      >
        <FlowHeader />
        <View>
          <Text accessibilityRole="header" style={styles.title}>
            {t.title}
          </Text>
          <Text style={styles.muted}>
            {device?.name ?? ''} · {status?.online ? t.online : t.offline}
          </Text>
        </View>

        <View style={styles.hero} testID="vana-durum">
          <View style={[styles.drop, { backgroundColor: running ? colors.water : '#2F5A49' }]}>
            <Icon name="drop" size={44} color={running ? '#FFFFFF' : '#CFE0D6'} />
          </View>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroSub}>{sub}</Text>
        </View>

        {!showSteps ? (
          <Card style={styles.advice}>
            <Text style={styles.adviceTitle}>{t.advice}</Text>
            <Text style={styles.muted}>{t.adviceBody}</Text>
          </Card>
        ) : null}

        {showSteps ? (
          <Card style={{ gap: spacing.md }}>
            {steps.map((s) => (
              <View key={s.key} style={styles.stepRow} testID={`adim-${s.key}`}>
                <View style={[styles.dot, { backgroundColor: stepColor[s.state] }]} />
                <Text style={styles.step}>
                  {s.label}
                  {s.state === 'active' ? ' …' : ''}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {phase === 'failed' ? <Notice tone="warn">{failText(command)}</Notice> : null}
        {error ? <Notice tone="warn">{error}</Notice> : null}

        {!stoppable ? (
          <View style={styles.modeRow}>
            <View style={[styles.mode, styles.modeOn]}>
              <Text style={[styles.modeText, { color: '#FFFFFF' }]}>{t.manual}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.auto}
              onPress={() => setAutoNote(true)}
              style={styles.mode}
            >
              <Text style={styles.modeText}>{t.auto}</Text>
            </Pressable>
          </View>
        ) : null}
        {autoNote ? <Notice>{t.autoSoon}</Notice> : null}
      </FlowScreen>

      <Modal
        visible={asking}
        transparent
        animationType="slide"
        onRequestClose={() => setAsking(false)}
      >
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <Text style={styles.big}>{t.askTitle}</Text>
            <Text style={styles.muted}>{t.askBody.replace('{{name}}', device?.name ?? '')}</Text>
            <View style={styles.durations}>
              {DURATIONS.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: minutes === m }}
                  accessibilityLabel={t.minutes.replace('{{min}}', String(m))}
                  onPress={() => setMinutes(m)}
                  style={[styles.duration, minutes === m && styles.durationOn]}
                  testID={`sure-${m}`}
                >
                  <Text style={[styles.durationText, minutes === m && { color: '#FFFFFF' }]}>
                    {t.minutes.replace('{{min}}', String(m))}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.sheetButtons}>
              <Button
                label={t.cancel}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => setAsking(false)}
              />
              <Button
                label={t.confirm}
                variant="water"
                style={{ flex: 1 }}
                onPress={() => void send('open')}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, color: colors.forest },
  big: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  hero: {
    backgroundColor: colors.forest,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  drop: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fontFamily.extrabold, fontSize: 28, color: '#FFFFFF', marginTop: 8 },
  heroSub: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: '#CFE0D6',
    textAlign: 'center',
  },
  advice: { gap: 4 },
  adviceTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.body, color: colors.forest },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 22, height: 22, borderRadius: 11 },
  step: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest, flex: 1 },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  mode: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  modeText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  auditRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  audit: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  scrim: { flex: 1, backgroundColor: '#14392B99', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    gap: spacing.md,
  },
  durations: { flexDirection: 'row', gap: spacing.sm },
  duration: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  durationText: { fontFamily: fontFamily.extrabold, fontSize: fontSize.body, color: colors.forest },
  sheetButtons: { flexDirection: 'row', gap: spacing.sm },
});
