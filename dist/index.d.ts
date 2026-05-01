import { Document, Schema } from 'mongoose';

type TranslationDocumentOptions<O> = O extends {
    languageField?: infer L extends string;
} ? {
    [K in L]: string;
} : never;
type TranslationDocumentMeta = {
    autoTranslated: boolean;
    sourceUpdatedAt: Date;
} & TranslationDocumentOptions<TranslationOptions>;
interface TranslatedDocumentMeta {
    nativeLanguage: string;
    supportedLanguages: string[];
}
type TranslatedPlainObject<T> = TranslationDocumentMeta & TranslatedDocumentMeta & T;
type NestedTranslation<T> = {
    [P in keyof T]?: NestedTranslation<T[P]>;
};
type TranslationDocument<T> = TranslationDocumentMeta & NestedTranslation<T>;
interface TranslatablePayload {
    text: string[];
    from: string;
    to: string;
}
type TranslatorFunction = (translationParams: TranslatablePayload) => Promise<string[]>;
type SanitizerFunction = (value: string) => string;
interface TranslationProvider {
    getTranslations: TranslatorFunction;
}
interface TranslationOptions {
    provider?: TranslationProvider;
    translator?: TranslatorFunction;
    defaultLanguage?: string;
    sanitizer?: SanitizerFunction;
    languageField?: string;
}
type BaseTranslatableDocument<T> = {
    getSupportedLanguages(): string[];
    getExistingTranslationForLocale(locale: string): TranslationDocument<T>;
    updateOrReplaceTranslation(translation: TranslationDocument<T>): Promise<void>;
    getSourceUpdatedAt(): Date;
    translationSourceMap(): Map<string, string>;
    getTranslation(locale: string): Promise<TranslationDocument<T>>;
    translate(locale: string): Promise<TranslatedPlainObject<T>>;
    translation: [TranslationDocument<T>];
    sourceUpdatedAt: Date;
} & {
    [K in keyof T]: T[K];
} & Document;
type TranslatableDocument<T, O = {
    languageField: 'language';
}> = BaseTranslatableDocument<T> & TranslationDocumentOptions<O>;

declare function translationPlugin<T>(schema: Schema, opts: TranslationOptions): void;

export { type NestedTranslation, type SanitizerFunction, type TranslatableDocument, type TranslatablePayload, type TranslatedDocumentMeta, type TranslatedPlainObject, type TranslationDocument, type TranslationDocumentMeta, type TranslationOptions, type TranslationProvider, type TranslatorFunction, translationPlugin };
