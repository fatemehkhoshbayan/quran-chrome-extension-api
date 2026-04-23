export interface VerseAudio {
  url: string;
  segments?: Array<Array<number>>;
}

export interface VerseTranslation {
  id: number;
  resource_name: number;
  text: string;
  language_name: string;
}

type VerseData = {
  id: number;
};
export interface ITafsir {
  verses: Record<string, VerseData>;
  resource_id: number;
  resource_name: string;
  language_id: number;
  translated_name: Record<string, string>;
  text: string;
}

export interface Verse {
  id: number;
  verse_number: number;
  verse_key: string;
  hizb_number: number;
  rub_el_hizb_number: number;
  ruku_number: number;
  manzil_number: number;
  sajdah_number: number;
  text_uthmani: string;
  chapter_id: number;
  chapter_name?: string;
  page_number: number;
  juz_number: number;
  translations?: VerseTranslation[];
  audio?: VerseAudio;
  tafsir ?: ITafsir;
}
