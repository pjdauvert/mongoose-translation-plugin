import type { Document } from 'mongoose';

export type TranslationDocumentMeta = {
  autoTranslated: boolean;
} & TranslationDocumentOptions<TranslationOptions>;

export interface TranslatedDocumentMeta {
  nativeLanguage: string;
  supportedLanguages: string[];
}

export type TranslatedPlainObject<T> = TranslationDocumentMeta & TranslatedDocumentMeta & T;

export type NestedTranslation<T> = {
  [P in keyof T]?: NestedTranslation<T[P]>;
};

export type TranslationDocument<T> = TranslationDocumentMeta & NestedTranslation<T>;

export interface TranslatablePayload {
  text: string[]; // texts to translate
  from: string; // original text local
  to: string; // destination locale to use
}

export type TranslatorFunction = (translationParams: TranslatablePayload) => Promise<string[]>;
export type SanitizerFunction = (value: string) => string;

// plugin options
export interface TranslationOptions {
  translator: TranslatorFunction;
  defaultLanguage?: string;
  sanitizer?: SanitizerFunction;
  languageField?: string;
  hashField?: string;
}

// Helper type to generate new properties based on options
type TranslationDocumentOptions<O> = O extends { languageField?: infer L extends string; hashField?: infer H extends string }
  ? { [K in L | H]: string }
  : never;

// methods
type BaseTranslatableDocument<T> = {
  getSupportedLanguages(): string[];
  getExistingTranslationForLocale(locale: string): TranslationDocument<T>;
  updateOrReplaceTranslation(translation: TranslationDocument<T>): Promise<void>;
  generateSourceHash(): string;
  translationSourceMap(): Map<string, string>;
  getTranslation(locale: string): Promise<TranslationDocument<T>>;
  translate(locale: string): Promise<TranslatedPlainObject<T>>;
  translation: [TranslationDocument<T>];
} & { [K in keyof T]: T[K] } & Document;

export type TranslatableDocument<T, O = { languageField: 'language'; hashField: 'sourceHash' }> = BaseTranslatableDocument<T> & TranslationDocumentOptions<O>;
/**
export type TranslatableModel<T extends Document> = Model<T>;

export interface TranslatableSchema extends Schema {
  plugin(plugin: (schema: TranslatableSchema, options?: Record<string, unknown>) => void, options?: TranslationOptions): this;

  // overload for the default mongoose plugin function
  plugin(plugin: (schema: Schema, options?: Record<string, unknown>) => void, opts?: Record<string, unknown>): this;
}
**/
