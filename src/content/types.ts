export type PartOfSpeech = "n" | "v" | "adj" | "adv" | "prep" | "conj";

/** Bản ghi thô ngay sau parser — mọi trường có thể null hoặc còn nhiễu OCR. */
export interface RawVocabEntry {
  ordinal: number;
  word: string;
  pos: PartOfSpeech;
  sourcePage: number;
  ipaRaw: string | null;
  synonymsRaw: string | null;
  meanRaw: string | null;
  expRaw: string | null;
  bodyLines: string[];
}

/** Bản ghi đã làm sạch, sẵn sàng seed. Không trường nào được null. */
export interface VocabWord {
  ordinal: number;
  word: string;
  pos: PartOfSpeech;
  ipa: string;
  meaningVi: string;
  definitionEn: string;
  definitionVi: string;
  synonyms: string[];
  exampleEn: string;
  exampleVi: string;
  blankAnswer: string;
}

export interface RawQuestion {
  index: number;
  stem: string;
  options: string[];
  sourceFile: string;
}

export interface GrammarQuestion {
  lessonSlug: string;
  stem: string;
  options: string[];
  answer: "A" | "B" | "C" | "D";
  explanation: string;
}

export interface GrammarLesson {
  ordinal: number;
  slug: string;
  title: string;
  summary: string;
  contentMd: string;
  contentHtml: string;
  sourceFile: string;
}

export interface LessonPlan {
  ordinal: number;
  grammarSlug: string;
  wordOrdinals: number[];
}
