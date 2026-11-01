import { useState } from 'react';
import { Text, View } from 'react-native';
import { INSTITUTION_LABEL } from '@tarim/agro-core';
import type { StaffApplicationDto } from '../../src/api/client';
import { Alan, GirisNot } from '../../src/components/Giris';
import {
  Bolum,
  Bos,
  Etiket,
  KucukDugme,
  YetkiliEkran,
  Yukleniyor,
  yetkiliText,
} from '../../src/components/Yetkili';
import { tr } from '../../src/i18n/tr';
import { api } from '../../src/session';
import { shortDate, useYukle } from '../../src/staff/useYukle';

const t = tr.staff;

function Basvuru({ a, onDone }: { a: StaffApplicationDto; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await api.staffDecision(a.userId, approve, note.trim() || undefined);
    } finally {
      setBusy(false);
      onDone();
    }
  };
  const place = [a.province, a.district].filter(Boolean).join(' / ') || 'Tüm Türkiye';
  return (
    <Bolum
      title={a.name ?? a.phone}
      right={
        <Etiket
          label={t.statusLabel[a.status]}
          tone={a.status === 'basvuru' ? 'uyari' : 'normal'}
        />
      }
      testID={`basvuru-${a.userId}`}
    >
      <Text style={yetkiliText.strong}>{a.institutionName}</Text>
      <Text style={yetkiliText.muted}>
        {INSTITUTION_LABEL[a.institution]} · {place} · {a.title}
      </Text>
      <Text style={yetkiliText.body}>
        {t.registry}: {a.registryNo} · {a.phone}
      </Text>
      <Text style={yetkiliText.muted}>
        {a.wantsRole === 'expert' ? t.roleExpert : t.roleAdmin}
        {a.expertise.length ? ` · ${t.expertise}: ${a.expertise.join(', ')}` : ''} ·{' '}
        {shortDate(a.createdAt)}
      </Text>
      {a.status === 'basvuru' ? (
        <>
          <Alan label={t.rejectNote} value={note} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <KucukDugme
              label={t.approveShort}
              busy={busy}
              testID={`basvuru-onay-${a.userId}`}
              onPress={() => void decide(true)}
            />
            <KucukDugme
              label={t.reject}
              tone="tehlike"
              busy={busy}
              onPress={() => void decide(false)}
            />
          </View>
        </>
      ) : null}
    </Bolum>
  );
}

/** Yönetici: yetkili başvuruları (kurum, yer, sicil no); onayda istenen rol verilir, başvurana bildirim gider. */
export default function Basvurular() {
  const list = useYukle(() => api.staffApplications());
  return (
    <YetkiliEkran
      title={t.applications}
      onRefresh={list.reload}
      refreshing={list.loading && !!list.data}
      testID="yetkili-basvurular-ekran"
    >
      {list.loading && !list.data ? <Yukleniyor /> : null}
      {list.error ? <GirisNot>{t.loadError}</GirisNot> : null}
      {list.data?.length === 0 ? <Bos>{t.empty}</Bos> : null}
      {list.data?.map((a) => (
        <Basvuru key={a.userId} a={a} onDone={list.reload} />
      ))}
    </YetkiliEkran>
  );
}
