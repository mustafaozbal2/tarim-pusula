import { useState } from 'react';
import { Text, View } from 'react-native';
import { GirisNot } from '../../src/components/Giris';
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
import { shortDate, targetText, useYukle } from '../../src/staff/useYukle';

const t = tr.staff;

/**
 * Kurum yetkililerinin (belediye, kooperatif...) taslakları: yalnız uzmanın yetki alanına düşenler.
 * Onaylanmadan çiftçiye gitmez (değişmez kural 1).
 */
export default function Taslaklar() {
  const list = useYukle(() => api.staffDrafts());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const approve = async (id: string) => {
    setBusy(id);
    try {
      await api.approveAnnouncement(id);
      setMsg(t.approved);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
      list.reload();
    }
  };
  return (
    <YetkiliEkran
      title={t.drafts}
      onRefresh={list.reload}
      refreshing={list.loading && !!list.data}
      testID="yetkili-taslaklar-ekran"
    >
      {msg ? <GirisNot tone="bilgi">{msg}</GirisNot> : null}
      {list.loading && !list.data ? <Yukleniyor /> : null}
      {list.error ? <GirisNot>{t.loadError}</GirisNot> : null}
      {list.data?.length === 0 ? <Bos>{t.empty}</Bos> : null}
      {list.data?.map((a) => (
        <Bolum key={a.id} title={a.title} right={<Etiket label={t.status.taslak} tone="uyari" />}>
          <Text style={yetkiliText.muted}>{a.sourceOrg}</Text>
          <Text style={yetkiliText.body}>{a.body}</Text>
          <Text style={yetkiliText.muted}>
            {targetText(a.targeting)} · {shortDate(a.publishedAt)}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <KucukDugme
              label={t.approve}
              busy={busy === a.id}
              testID={`taslak-onayla-${a.id}`}
              onPress={() => void approve(a.id)}
            />
          </View>
        </Bolum>
      ))}
    </YetkiliEkran>
  );
}
