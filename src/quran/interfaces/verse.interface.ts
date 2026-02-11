export interface VerseWord {
  id: number;
  position: number;
  text_uthmani?: string;
  text_imlaei?: string;
  transliteration?: string;
}

export interface VerseAudio {
  url: string;
  duration?: number;
}

export interface VerseTranslation {
  id: number;
  resource_name: number;
  text: string;
  language_name: string;
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
  page_number: number;
  juz_number: number;
  translations?: VerseTranslation[];

  rub_number: number;
  image_url?: string;
  image_width?: number;

  verse_index?: number;
  code_v1?: string;
  code_v2?: string;

  v1_page?: number;
  v2_page?: number;
  words?: VerseWord[];
  audio?: VerseAudio;
}
