import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, homeColors, radius } from '@tarim/ui';
import type { AnnouncementCreateBody, ScopeDto } from '../../src/api/client';
import { Alan, AraSec, GirisNot, Secenekler, useIslem } from '../../src/components/Giris';
import { UrunSecici } from '../../src/components/UrunSecici';
import {
  Bolum,
  Etiket,
  KucukDugme,
  YetkiliEkran,
  Yukleniyor,
  yetkiliText,
} from '../../src/components/Yetkili';
import { tr } from '../../src/i18n/tr';
import { api } from '../../src/session';
import { pickPhoto } from '../../src/staff/photo';
import { useYukle } from '../../src/staff/useYukle';

const t = tr.staff;
type Category = NonNullable<AnnouncementCreateBody['category']>;
type Mode = 'tum' | 'il' | 'ilce';

/** Kapsama göre seçilebilen hedefler: ilçe yetkilisi yalnız kendi ilçesi, il yetkilisi il ya da ilçesi. */
function modesFor(scope: ScopeDto): Mode[] {
  if (scope.level === 'ulke') return ['tum', 'il', 'ilce'];
  if (scope.level === 'il') return ['il', 'ilce'];
  return ['ilce'];
}

/**
 * Duyuru yayınla: başlık, metin, tür, hedef bölge (yetki alanıyla sınırlı), ürün filtresi, fotoğraf.
 * Uzman duyurusu doğrudan yayına girer; kurum yetkilisinin duyurusu uzman onayına düşer.
 */
export default function DuyuruYeni() {
  const router = useRouter();
  const me = useYukle(() => api.staffMe());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('bilgilendirme');
  const [mode, setMode] = useState<Mode | null>(null);
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [crops, setCrops] = useState<{ id: string; name: string }[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [pickCrop, setPickCrop] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { busy, error, run, setError } = useIslem();

  const scope = me.data?.scope ?? null;
  // Kapsam gelince varsayılan hedef: kendi bölgesi.
  useEffect(() => {
    if (!scope) return;
    const modes = modesFor(scope);
    setMode((m) => m ?? modes[0]!);
    if (scope.level !== 'ulke') setProvince(scope.province);
    if (scope.level === 'ilce') setDistrict(scope.district);
  }, [scope]);
  useEffect(() => {
    if (scope?.level === 'ulke') api.provinces().then(setProvinces, () => setProvinces([]));
  }, [scope]);
  useEffect(() => {
    setDistricts([]);
    if (province && scope?.level !== 'ilce') {
      api.districts(province).then(setDistricts, () => setDistricts([]));
    }
  }, [province, scope]);

  const places = (): AnnouncementCreateBody['targeting']['places'] | null => {
    if (mode === 'tum') return [];
    if (mode === 'il') return province ? [{ province }] : null;
    if (mode === 'ilce') return province && district ? [{ province, district }] : null;
    return null;
  };

  const publish = () => {
    const target = places();
    if (title.trim().length < 3 || body.trim().length < 3 || target === null) {
      return setError(t.missing);
    }
    const p = me.data?.profile;
    void run(async () => {
      const r = await api.createAnnouncement({
        sourceOrg: p?.institutionName ?? tr.app.name,
        title: title.trim(),
        body: body.trim(),
        category,
        publishedAt: new Date().toISOString(),
        imageDataUrl: image,
        targeting: { places: target, circle: null, cropIds: crops.map((c) => c.id) },
      });
      setNote(r.reviewStatus === 'uzman-onayli' ? t.published : t.draftSaved);
      setTitle('');
      setBody('');
      setImage(null);
      setCrops([]);
    });
  };

  const photo = async () => {
    setError(null);
    const r = await pickPhoto();
    if (r.kind === 'ok') setImage(r.dataUrl);
    else if (r.kind === 'buyuk') setError(t.photoTooBig);
    else if (r.kind === 'izin') setError(t.photoDenied);
  };

  const modeLabel: Record<Mode, string> = {
    tum: t.targetAll,
    il: scope?.level === 'ulke' ? t.targetProvince : `${t.targetWhole} (${province})`,
    ilce: scope?.level === 'ilce' ? `${province} / ${district}` : t.targetDistrict,
  };

  return (
    <YetkiliEkran title={t.newAnn} testID="yetkili-duyuru-ekran">
      {me.loading ? <Yukleniyor /> : null}
      {me.error ? <GirisNot>{t.loadError}</GirisNot> : null}
      {note ? <GirisNot tone="bilgi">{note}</GirisNot> : null}
      {scope ? (
        <>
          <Bolum title={t.newAnn}>
            <Text style={yetkiliText.label}>{t.category}</Text>
            <Secenekler
              options={(Object.keys(t.categories) as Category[]).map((k) => ({
                key: k,
                label: t.categories[k],
              }))}
              value={category}
              onChange={setCategory}
              testID="duyuru-tur"
            />
            <Alan label={t.title} value={title} onChangeText={setTitle} testID="duyuru-baslik" />
            <Text style={yetkiliText.label}>{t.body}</Text>
            <TextInput
              testID="duyuru-metin"
              accessibilityLabel={t.body}
              value={body}
              onChangeText={setBody}
              multiline
              style={styles.area}
            />
            <Text style={yetkiliText.muted}>{t.bodyHint}</Text>
            {image ? (
              <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
            ) : null}
            <View style={styles.row}>
              <KucukDugme
                tone="ikinci"
                label={image ? t.photoChange : t.photo}
                testID="duyuru-foto"
                onPress={() => void photo()}
              />
              {image ? (
                <KucukDugme tone="ikinci" label={t.photoRemove} onPress={() => setImage(null)} />
              ) : null}
            </View>
          </Bolum>
          <Bolum title={t.target}>
            <Etiket label={`${t.scope}: ${me.data?.scopeLabel ?? ''}`} />
            <Secenekler
              options={modesFor(scope).map((m) => ({ key: m, label: modeLabel[m] }))}
              value={mode}
              onChange={setMode}
              testID="duyuru-hedef"
            />
            {scope.level === 'ulke' && mode !== 'tum' ? (
              <AraSec
                label={tr.auth.province}
                items={provinces}
                value={province}
                onChange={(v) => {
                  setProvince(v);
                  setDistrict('');
                }}
                testID="duyuru-il"
              />
            ) : null}
            {mode === 'ilce' && scope.level !== 'ilce' && province ? (
              <AraSec
                key={province}
                label={tr.auth.district}
                items={districts}
                value={district}
                onChange={setDistrict}
                testID="duyuru-ilce"
              />
            ) : null}
            <Text style={yetkiliText.label}>{t.crops}</Text>
            <Text style={yetkiliText.muted}>{t.cropsAll}</Text>
            {crops.length > 0 ? (
              <View style={styles.chips}>
                {crops.map((c) => (
                  <KucukDugme
                    key={c.id}
                    tone="ikinci"
                    label={`${c.name} · ${tr.auth.remove}`}
                    onPress={() => setCrops((xs) => xs.filter((x) => x.id !== c.id))}
                  />
                ))}
              </View>
            ) : null}
            {pickCrop ? (
              <UrunSecici
                value={null}
                testID="duyuru-urun"
                onChange={(id, name) => {
                  setCrops((xs) => (xs.some((x) => x.id === id) ? xs : [...xs, { id, name }]));
                  setPickCrop(false);
                }}
              />
            ) : (
              <View style={styles.row}>
                <KucukDugme
                  tone="ikinci"
                  label={tr.auth.addCrop}
                  testID="duyuru-urun-ekle"
                  onPress={() => setPickCrop(true)}
                />
              </View>
            )}
          </Bolum>
          {error ? <GirisNot>{error}</GirisNot> : null}
          <View style={styles.row}>
            <KucukDugme label={t.publish} busy={busy} testID="duyuru-yayinla" onPress={publish} />
            <KucukDugme
              tone="ikinci"
              label={t.myAnns}
              onPress={() => router.push('/yetkili/duyurular')}
            />
          </View>
        </>
      ) : null}
    </YetkiliEkran>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  area: {
    minHeight: 120,
    textAlignVertical: 'top',
    borderRadius: radius.row,
    borderWidth: 1.5,
    borderColor: homeColors.band,
    backgroundColor: colors.surface,
    padding: 12,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.forest,
  },
  image: { width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.card },
});
