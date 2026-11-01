import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { INSTITUTION_LABEL, INSTITUTIONS } from '@tarim/agro-core';
import { colors, fontFamily, homeColors } from '@tarim/ui';
import type { InstitutionKey } from '../../src/api/client';
import { passwordProblem } from '../../src/auth/password';
import {
  Alan,
  AraSec,
  GirisDugme,
  GirisNot,
  GirisZemin,
  Onay,
  Secenekler,
  useIslem,
} from '../../src/components/Giris';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { UrunSecici } from '../../src/components/UrunSecici';
import { tr } from '../../src/i18n/tr';
import { api, setSessionKind, setToken } from '../../src/session';

const t = tr.auth;
const STEPS = 3;

/** Kurum türüne göre il/ilçe sorulur mu (yetki alanı bundan çıkar; yetki.ts scopeOf ile aynı). */
const needsProvince = (i: InstitutionKey | null) => i !== null && i !== 'bakanlik';
const needsDistrict = (i: InstitutionKey | null) => i === 'ilce_mudurlugu' || i === 'belediye';

/**
 * Yetkili başvurusu (3 adım): kurum ve yetki alanı, görev bilgisi, hesap + SMS. Başvuru yönetici
 * onayına kadar yayın ve cevap yetkisi vermez. TC kimlik numarası istenmez.
 */
export default function YetkiliKayit() {
  const [step, setStep] = useState(1);
  const [institution, setInstitution] = useState<InstitutionKey | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [registryNo, setRegistryNo] = useState('');
  const [wantsRole, setWantsRole] = useState<'expert' | 'institution_admin'>('expert');
  const [expertise, setExpertise] = useState<{ id: string; name: string }[]>([]);
  const [pickCrop, setPickCrop] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [kvkk, setKvkk] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const { busy, error, noServer, run, setError } = useIslem();

  useEffect(() => {
    api.provinces().then(setProvinces, () => setProvinces([]));
  }, []);
  useEffect(() => {
    setDistricts([]);
    if (province) api.districts(province).then(setDistricts, () => setDistricts([]));
  }, [province]);

  const next = () => {
    setError(null);
    if (step === 1) {
      const ok =
        institution &&
        institutionName.trim().length >= 2 &&
        (!needsProvince(institution) || province) &&
        (!needsDistrict(institution) || district);
      if (!ok) return setError(t.missing);
    }
    if (step === 2 && (name.trim().length < 2 || title.trim().length < 2 || !registryNo.trim())) {
      return setError(t.missing);
    }
    setStep((s) => s + 1);
  };

  const sendCode = () => {
    const problem = passwordProblem(password, again);
    if (problem) return setError(problem);
    if (!kvkk) return setError(t.kvkkMissing);
    void run(async () => {
      await api.requestOtp(phone);
      setSent(true);
    });
  };
  const apply = () =>
    void run(async () => {
      if (!institution) return;
      const r = await api.staffRegister({
        phone,
        code,
        password,
        name: name.trim(),
        institution,
        institutionName: institutionName.trim(),
        province: needsProvince(institution) ? province : undefined,
        district: needsDistrict(institution) ? district : undefined,
        title: title.trim(),
        registryNo: registryNo.trim(),
        expertise: expertise.map((e) => e.id),
        wantsRole,
        kvkk: true,
      });
      await setSessionKind('yetkili');
      await setToken(r.token);
    });

  const stepTitle = [t.stepInstitution, t.stepPerson, t.stepAccount][step - 1];
  return (
    <GirisZemin back title={t.staffRegisterTitle} testID="giris-yetkili-kayit">
      <Text style={styles.step}>
        {t.step.replace('{{n}}', String(step)).replace('{{t}}', String(STEPS))} · {stepTitle}
      </Text>
      {step === 1 ? (
        <>
          <Text style={styles.label}>{t.institution}</Text>
          <Secenekler
            options={INSTITUTIONS.map((k) => ({ key: k, label: INSTITUTION_LABEL[k] }))}
            value={institution}
            onChange={(k) => setInstitution(k)}
            testID="basvuru-kurum"
          />
          <Alan
            label={t.institutionName}
            value={institutionName}
            onChangeText={setInstitutionName}
            hint={t.institutionNameHint}
            testID="basvuru-kurum-adi"
          />
          {needsProvince(institution) ? (
            <AraSec
              label={t.province}
              items={provinces}
              value={province}
              onChange={(v) => {
                setProvince(v);
                setDistrict('');
              }}
              testID="basvuru-il"
            />
          ) : null}
          {needsDistrict(institution) && province ? (
            <AraSec
              key={province}
              label={t.district}
              items={districts}
              value={district}
              onChange={setDistrict}
              testID="basvuru-ilce"
            />
          ) : null}
          <GirisNot tone="bilgi">{t.scopeNote}</GirisNot>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Alan label={t.name} value={name} onChangeText={setName} testID="basvuru-ad" />
          <Alan
            label={t.titleField}
            value={title}
            onChangeText={setTitle}
            hint={t.titleHint}
            testID="basvuru-unvan"
          />
          <Alan
            label={t.registryNo}
            value={registryNo}
            onChangeText={setRegistryNo}
            hint={t.registryHint}
            testID="basvuru-sicil"
          />
          <Text style={styles.label}>{t.role}</Text>
          <Secenekler
            options={[
              { key: 'expert' as const, label: t.roleExpert },
              { key: 'institution_admin' as const, label: t.roleAdmin },
            ]}
            value={wantsRole}
            onChange={setWantsRole}
            testID="basvuru-rol"
          />
          <Text style={styles.label}>{t.expertise}</Text>
          {expertise.length > 0 ? (
            <View style={styles.chips}>
              {expertise.map((e) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.name} ${t.remove}`}
                  onPress={() => setExpertise((xs) => xs.filter((x) => x.id !== e.id))}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>
                    {e.name} · {t.remove}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {pickCrop ? (
            <UrunSecici
              value={null}
              testID="basvuru-urun"
              onChange={(id, cropName) => {
                setExpertise((xs) =>
                  xs.some((x) => x.id === id) || xs.length >= 10
                    ? xs
                    : [...xs, { id, name: cropName }],
                );
                setPickCrop(false);
              }}
            />
          ) : (
            <GirisDugme
              label={t.addCrop}
              tone="ikinci"
              testID="basvuru-urun-ekle"
              onPress={() => setPickCrop(true)}
            />
          )}
        </>
      ) : null}
      {step === 3 ? (
        sent ? (
          <>
            <GirisNot tone="bilgi">{t.codeSent}</GirisNot>
            <Alan
              label={t.code}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              testID="basvuru-kod"
            />
            <GirisNot tone="bilgi">{t.reviewNote}</GirisNot>
          </>
        ) : (
          <>
            <Alan
              label={t.phone}
              value={phone}
              onChangeText={setPhone}
              placeholder="05XX XXX XX XX"
              keyboardType="phone-pad"
              autoComplete="tel"
              testID="basvuru-telefon"
            />
            <Alan
              label={t.passwordNew}
              value={password}
              onChangeText={setPassword}
              secret
              autoComplete="new-password"
              hint={t.passwordHint}
              testID="basvuru-sifre"
            />
            <Alan
              label={t.passwordAgain}
              value={again}
              onChangeText={setAgain}
              secret
              autoComplete="new-password"
              testID="basvuru-sifre2"
            />
            <Onay checked={kvkk} onChange={setKvkk} testID="basvuru-kvkk">
              {t.kvkk}
            </Onay>
          </>
        )
      ) : null}
      {error ? <GirisNot>{error}</GirisNot> : null}
      {noServer ? <SunucuKarti /> : null}
      {step < STEPS ? (
        <GirisDugme label={t.next} testID="basvuru-devam" onPress={next} />
      ) : sent ? (
        <GirisDugme label={t.apply} busy={busy} testID="basvuru-gonder" onPress={apply} />
      ) : (
        <GirisDugme label={t.sendCode} busy={busy} testID="basvuru-kod-gonder" onPress={sendCode} />
      )}
      {step > 1 && !sent ? (
        <GirisDugme label={tr.flow.back} tone="yazi" onPress={() => setStep((s) => s - 1)} />
      ) : null}
    </GirisZemin>
  );
}

const styles = StyleSheet.create({
  step: { fontFamily: fontFamily.bold, fontSize: 13, color: homeColors.tabSelected },
  label: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.pistachio,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.forest },
});
