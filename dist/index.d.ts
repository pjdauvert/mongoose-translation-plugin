import { Document, Schema } from 'mongoose';

type TranslationDocumentMeta = {
    autoTranslated: boolean;
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
interface TranslationOptions {
    translator: TranslatorFunction;
    defaultLanguage?: string;
    sanitizer?: SanitizerFunction;
    languageField?: string;
    hashField?: string;
}
type TranslationDocumentOptions<O> = Required<O> extends {
    languageField: infer L extends string;
    hashField: infer H extends string;
} ? {
    [K in L | H]: string;
} : never;
interface BaseTranslatableDocument<T> extends Document {
    getSupportedLanguages(): string[];
    getExistingTranslationForLocale(locale: string): TranslationDocument<T>;
    updateOrReplaceTranslation(translation: TranslationDocument<T>): Promise<void>;
    generateSourceHash(): string;
    translationSourceMap(): Map<string, string>;
    getTranslation(locale: string): Promise<TranslationDocument<T>>;
    translate(locale: string): Promise<TranslatedPlainObject<T>>;
    translation: [TranslationDocument<T>];
}
type TranslatableDocument<T> = BaseTranslatableDocument<T> & TranslationDocumentOptions<TranslationOptions>;

declare function translationPlugin<T>(schema: Schema, opts: TranslationOptions): void;

export { type NestedTranslation, type SanitizerFunction, type TranslatableDocument, type TranslatablePayload, type TranslatedDocumentMeta, type TranslatedPlainObject, type TranslationDocument, type TranslationDocumentMeta, type TranslationOptions, type TranslatorFunction, translationPlugin };
