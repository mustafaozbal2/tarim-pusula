import type { PageText } from '@tarim/agro-core';
import { pdfToPages, textToPages } from '../library';
import { docxToContent } from './docx';

export type SourceFormat = 'pdf' | 'docx' | 'txt';

export interface Extracted {
  format: SourceFormat;
  pages: PageText[];
  tables: string[][][];
}

export const MAX_FILE_BYTES = 40 * 1024 * 1024;

const starts = (b: Uint8Array, sig: string) =>
  Buffer.from(b.subarray(0, sig.length)).toString('latin1') === sig;

/** Biçim uzantıya değil içeriğin imzasına bakılarak belirlenir; uzantı yalnız düz metin için ipucudur. */
export async function extractContent(name: string, input: Uint8Array): Promise<Extracted> {
  // Buffer değil düz Uint8Array (pdfjs şartı); kopya, pdfjs'in tamponu devralmasına karşı da güvenli.
  const data = new Uint8Array(input);
  if (data.byteLength === 0) throw new Error('Dosya boş');
  if (data.byteLength > MAX_FILE_BYTES) throw new Error('Dosya çok büyük');
  const lower = name.toLowerCase();
  if (starts(data, '%PDF-')) {
    return { format: 'pdf', pages: await pdfToPages(data), tables: [] };
  }
  if (starts(data, 'PK\x03\x04')) {
    if (!lower.endsWith('.docx'))
      throw new Error('ZIP dosyası yalnız .docx uzantısıyla kabul edilir');
    const d = docxToContent(data);
    return { format: 'docx', pages: d.pages, tables: d.tables };
  }
  if (starts(data, '\xD0\xCF\x11\xE0')) {
    throw new Error('Eski .doc biçimi desteklenmiyor; Word’de .docx olarak kaydedin');
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
      throw new Error('Metin dosyası UTF-8 değil');
    }
    if (text.includes('\0')) throw new Error('Metin dosyası ikili veri içeriyor');
    return { format: 'txt', pages: textToPages(text), tables: [] };
  }
  throw new Error('Desteklenmeyen dosya türü');
}
