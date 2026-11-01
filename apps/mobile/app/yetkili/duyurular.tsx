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

/** Yetkilinin yayınladığı duyurular: hedef bölge, ürün filtresi, durum; silinebilir. */
export default function Duyurularim() {
  const list = useYukle(() => api.staffAnnouncements());
  const remove = async (id: string) => {
    await api.deleteAnnouncement(id).catch(() => undefined);
    list.reload();
  };
  return (
    <YetkiliEkran
      title={t.myAnns}
      onRefresh={list.reload}
      refreshing={list.loading && !!list.data}
      testID="yetkili-duyurular-ekran"
    >
      {list.loading && !list.data ? <Yukleniyor /> : null}
      {list.error ? <GirisNot>{t.loadError}</GirisNot> : null}
      {list.data?.length === 0 ? <Bos>{t.empty}</Bos> : null}
      {list.data?.map((a) => (
        <Bolum
          key={a.id}
          title={a.title}
          right={
            <Etiket
              label={a.reviewStatus === 'uzman-onayli' ? t.status.onayli : t.status.taslak}
              tone={a.reviewStatus === 'uzman-onayli' ? 'normal' : 'uyari'}
            />
          }
        >
          <Text style={yetkiliText.body}>{a.body}</Text>
          <Text style={yetkiliText.muted}>
            {targetText(a.targeting)}
            {a.targeting.cropIds?.length ? ` · ${t.crop}: ${a.targeting.cropIds.join(', ')}` : ''}
            {a.category ? ` · ${t.categories[a.category as keyof typeof t.categories] ?? ''}` : ''}
            {a.hasImage ? ` · ${t.photoTag}` : ''} · {shortDate(a.publishedAt)}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <KucukDugme tone="tehlike" label={t.delete} onPress={() => void remove(a.id)} />
          </View>
        </Bolum>
      ))}
    </YetkiliEkran>
  );
}
