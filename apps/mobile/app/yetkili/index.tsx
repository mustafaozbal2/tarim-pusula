import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { INSTITUTION_LABEL } from '@tarim/agro-core';
import { GirisNot } from '../../src/components/Giris';
import {
  Bolum,
  Bos,
  Etiket,
  KucukDugme,
  PanelKutu,
  PanelKutular,
  YetkiliEkran,
  Yukleniyor,
  yetkiliText,
} from '../../src/components/Yetkili';
import { tr } from '../../src/i18n/tr';
import { api, setToken } from '../../src/session';
import { shortDate, useYukle } from '../../src/staff/useYukle';

const t = tr.staff;

/**
 * Yetkili ana sayfası: kim olduğu, yetki alanı (ilçe/il/Türkiye), başvuru durumu ve işler (duyuru,
 * gelen sorular, onay bekleyen taslaklar, başvurular). Rol neyse yalnız o kutular görünür.
 */
export default function YetkiliPanel() {
  const router = useRouter();
  const panel = useYukle(async () => {
    const me = await api.staffMe();
    const approved = !me.profile || me.profile.status === 'onayli';
    const expert = me.roles.includes('expert');
    const admin = me.roles.includes('admin');
    const [queue, drafts, apps, inbox] = await Promise.all([
      approved && (expert || admin) ? api.expertQueue().catch(() => []) : [],
      approved && (expert || admin) ? api.staffDrafts().catch(() => []) : [],
      admin ? api.staffApplications().catch(() => []) : [],
      api.inbox().catch(() => []),
    ]);
    return { me, approved, expert, admin, queue, drafts, apps, inbox };
  });

  const logout = async () => {
    await api.logout().catch(() => undefined);
    await setToken(null);
  };

  const d = panel.data;
  const p = d?.me.profile;
  const roles = d
    ? [
        d.expert ? t.roleExpert : null,
        d.me.roles.includes('institution_admin') ? t.roleAdmin : null,
        d.admin ? t.roleSuper : null,
      ].filter(Boolean)
    : [];
  return (
    <YetkiliEkran
      title={t.panel}
      root
      onRefresh={panel.reload}
      refreshing={panel.loading && !!d}
      testID="yetkili-panel"
    >
      {panel.loading && !d ? <Yukleniyor /> : null}
      {panel.error ? <GirisNot>{t.loadError}</GirisNot> : null}
      {d ? (
        <>
          <Bolum
            title={p ? p.institutionName : tr.app.name}
            right={<KucukDugme label={t.logout} tone="ikinci" onPress={() => void logout()} />}
          >
            {p ? (
              <Text style={yetkiliText.muted}>
                {INSTITUTION_LABEL[p.institution]} · {p.title}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {d.me.scopeLabel ? <Etiket label={`${t.scope}: ${d.me.scopeLabel}`} /> : null}
              {roles.map((r) => (
                <Etiket key={r} label={r!} />
              ))}
            </View>
          </Bolum>
          {p && p.status === 'basvuru' ? (
            <Bolum title={t.pendingTitle} testID="yetkili-bekliyor">
              <Text style={yetkiliText.body}>{t.pendingText}</Text>
            </Bolum>
          ) : null}
          {p && p.status === 'reddedildi' ? (
            <Bolum title={t.rejectedTitle}>
              <Text style={yetkiliText.body}>{p.decisionNote ?? tr.auth.reviewNote}</Text>
            </Bolum>
          ) : null}
          {d.approved && roles.length > 0 ? (
            <PanelKutular>
              <PanelKutu
                icon="bell"
                title={t.newAnn}
                hint={t.newAnnHint}
                testID="yetkili-duyuru-yeni"
                onPress={() => router.push('/yetkili/duyuru')}
              />
              <PanelKutu
                icon="book"
                title={t.myAnns}
                testID="yetkili-duyurular"
                onPress={() => router.push('/yetkili/duyurular')}
              />
              {d.expert || d.admin ? (
                <PanelKutu
                  icon="people"
                  title={t.questions}
                  hint={t.questionsHint}
                  count={d.queue.length}
                  testID="yetkili-sorular"
                  onPress={() => router.push('/yetkili/sorular')}
                />
              ) : null}
              {d.expert || d.admin ? (
                <PanelKutu
                  icon="target"
                  title={t.drafts}
                  hint={t.draftsHint}
                  count={d.drafts.length}
                  testID="yetkili-taslaklar"
                  onPress={() => router.push('/yetkili/taslaklar')}
                />
              ) : null}
              {d.admin ? (
                <PanelKutu
                  icon="settings"
                  title={t.applications}
                  hint={t.applicationsHint}
                  count={d.apps.filter((a) => a.status === 'basvuru').length}
                  testID="yetkili-basvurular"
                  onPress={() => router.push('/yetkili/basvurular')}
                />
              ) : null}
            </PanelKutular>
          ) : null}
          <Bolum title={t.inbox}>
            {d.inbox.length === 0 ? <Bos>{t.empty}</Bos> : null}
            {d.inbox.slice(0, 8).map((n) => (
              <View key={n.id} style={{ gap: 2 }}>
                <Text style={yetkiliText.label}>{n.title}</Text>
                <Text style={yetkiliText.body}>{n.body}</Text>
                <Text style={yetkiliText.muted}>{shortDate(n.createdAt)}</Text>
              </View>
            ))}
          </Bolum>
        </>
      ) : null}
    </YetkiliEkran>
  );
}
