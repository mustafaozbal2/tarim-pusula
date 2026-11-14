import { describe, expect, it } from 'vitest';
import { EYLEMLER, HIZLI, niyetBul, sadelestir } from './niyet';

const k = (s: string) => niyetBul(s)?.key ?? null;

describe('asistan niyet eşleyici', () => {
  it('Türkçe sadeleştirme', () => {
    expect(sadelestir('  Yeni TARLA Ekle!  ')).toBe('yeni tarla ekle');
    expect(sadelestir('Şırnak’ta ığdır üzümü')).toBe('sirnak ta igdir uzumu');
  });

  it('tarla ekleme', () => {
    expect(k('Tarla ekle')).toBe('tarla-ekle');
    expect(k('yeni bir arazi kaydetmek istiyorum')).toBe('tarla-ekle');
    expect(k('Yeni bahçe')).toBe('tarla-ekle');
    expect(k('tarlalarım')).toBe('tarlalarim');
  });

  it('uzmana soru ve sorularım', () => {
    expect(k('Uzmana sormak istiyorum')).toBe('uzmana-sor');
    expect(k('fıstık yapraklarında leke var')).toBe('uzmana-sor');
    expect(k('domateste böcek gördüm')).toBe('uzmana-sor');
    expect(k('sorularım')).toBe('sorularim');
    expect(k('uzman cevabı geldi mi')).toBe('sorularim');
  });

  it('hava, sulama, takvim, pazar, bildirim, ayarlar', () => {
    expect(k('Yarın yağmur yağacak mı')).toBe('hava');
    expect(k('bu gece don olacak mı')).toBe('hava');
    expect(k('ne kadar sulamalıyım')).toBe('sulama');
    expect(k('budama ne zaman')).toBe('takvim');
    expect(k('fıstık fiyatı kaç lira')).toBe('pazar');
    expect(k('bildirimlerim')).toBe('bildirimler');
    expect(k('yazı boyutunu büyüt')).toBe('ayarlar');
  });

  it('ikiz tarım: senaryo cümleleri', () => {
    expect(niyetBul('Sulamayı 3 gün ertelesem ne olur?')?.key).toBe('ikiz');
    expect(niyetBul('10 gün sulamazsam ne olur')?.key).toBe('ikiz');
    expect(niyetBul('ikiz tarımı aç')?.key).toBe('ikiz');
    expect(niyetBul('vanayı aç')?.key).toBe('sulama');
  });

  it('bilmediğinde uydurmaz: null döner (uzmana yönlendirme önerilir)', () => {
    expect(k('')).toBeNull();
    expect(k('merhaba')).toBeNull();
    expect(k('asdf qwer')).toBeNull();
  });

  it('hızlı seçenekler ve yollar tanımlı', () => {
    for (const key of HIZLI) expect(EYLEMLER[key].route).toMatch(/^\//);
  });
});
