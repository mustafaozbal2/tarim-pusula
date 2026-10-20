import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize } from '@tarim/ui';
import type { ProposalDto } from '../api/client';
import { tr } from '../i18n/tr';
import { api } from '../session';

/** Yakınların önerdiği, çiftçinin onayını bekleyen tarlalar. Onaylayınca tarla çiftçinin hesabına kaydolur. */
export function PendingProposals({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<ProposalDto[]>([]);

  const load = useCallback(() => {
    api.nearbyProposals().then(
      (all) => setItems(all.filter((p) => p.as === 'owner' && p.status === 'pending')),
      () => undefined, // çevrimdışı: kart gösterilmez
    );
  }, []);
  useEffect(load, [load]);

  async function decide(id: string, approve: boolean) {
    await api.nearbyDecide(id, approve).catch(() => undefined);
    load();
    onChanged?.();
  }

  if (items.length === 0) return null;
  return (
    <>
      {items.map((p) => (
        <Card key={p.id} style={styles.card}>
          <Text style={styles.kicker}>{tr.fields.proposalTitle}</Text>
          <Text style={styles.name} testID="oneri-ad">
            {p.payload.name}
          </Text>
          <Text style={styles.detail}>
            {[p.payload.village, p.payload.district, p.payload.province]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.row}>
            <Button
              variant="secondary"
              label={tr.fields.reject}
              style={{ flex: 1 }}
              onPress={() => void decide(p.id, false)}
            />
            <Button
              label={tr.fields.approve}
              style={{ flex: 1 }}
              onPress={() => void decide(p.id, true)}
            />
          </View>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, borderColor: colors.forest, borderWidth: 2 },
  kicker: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.textMuted },
  name: { fontFamily: fontFamily.extrabold, fontSize: 22, color: colors.forest },
  detail: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
