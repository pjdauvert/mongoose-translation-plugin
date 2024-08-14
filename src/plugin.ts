import { Schema, type SchemaDefinition } from 'mongoose';

import type {
  TranslatableDocument,
  TranslatedDocumentMeta,
  TranslatedPlainObject,
  TranslationDocument,
  TranslationDocumentMeta,
  TranslationOptions
} from './mongoose.types';
import { buildTranslationSchema, getTranslatablePaths } from './schema';
import { applyTranslation, generateAutoTranslation, generateObjectFromPathMap, hashMapStringValues, mapTranslationSource } from './tools';

export function translationPlugin<T>(schema: Schema, opts: TranslationOptions): void {
  if (typeof opts.translator !== 'function') throw new Error('[Options]: translator must be a function: ({ text, from, to }) => [String]');

  const options: Required<TranslationOptions> = {
    translator: opts.translator,
    sanitizer: opts.sanitizer || ((value: string): string => value),
    defaultLanguage: opts.defaultLanguage || 'en',
    languageField: opts.languageField || 'language',
    hashField: opts.hashField || 'sourceHash'
  };

  const pathsToTranslate = getTranslatablePaths(schema);
  // add translation array to schema, and the additional fields
  // related to translation to be stored (hash, language, autoTranslated)

  const schemaFields: SchemaDefinition = {
    [options.hashField]: { type: String },
    [options.languageField]: { type: String, default: options.defaultLanguage }
  };

  // add native entity translation related properties
  schema.add(schemaFields);

  // add translation schema to native entity based on translatable paths
  const translationSchemaDefinition = buildTranslationSchema(schema, schemaFields, pathsToTranslate);
  const translationSchema = new Schema(translationSchemaDefinition, { _id: false });
  schema.add({ translation: [translationSchema] });

  schema.pre<TranslatableDocument<T>>('save', function generateNativeHash() {
    this.set(options.hashField, this.generateSourceHash());
  });

  schema.methods.getSupportedLanguages = function getSupportedLanguages(): string[] {
    const supportedLanguages = [this.get(options.languageField)];
    const translation = this.get('translation');
    if (translation && Array.isArray(translation)) {
      for (const tr of translation) {
        supportedLanguages.push(tr[options.languageField]);
      }
    } else throw new Error('Incorrect translation field');
    return supportedLanguages;
  };

  schema.methods.getExistingTranslationForLocale = function getExistingTranslationForLocale(locale: string): TranslationDocument<T> | undefined {
    const translation = this.get('translation').find((trad: TranslationDocument<T>) => trad[options.languageField] === locale);
    return translation?.toObject();
  };

  schema.methods.updateOrReplaceTranslation = async function updateOrReplaceTranslation(translation: TranslationDocument<T>): Promise<void> {
    const translations = this.get('translation').filter((t: TranslationDocument<T>) => t[options.languageField] !== translation[options.languageField]);
    translations.push(translation);
    this.set('translation', translations);
    await this.save();
  };

  schema.methods.translationSourceMap = function translationSourceMap(): Map<string, string> {
    return mapTranslationSource(this.toObject(), pathsToTranslate, options.sanitizer);
  };

  schema.methods.generateSourceHash = function generateSourceHash(): string {
    const translationSource = (this as TranslatableDocument<T>).translationSourceMap();
    return hashMapStringValues(translationSource);
  };

  schema.methods.getTranslation = async function getTranslation(locale: string): Promise<TranslationDocument<T>> {
    // flatten object
    const _this = this as TranslatableDocument<T>;
    const translationSource = _this.translationSourceMap();
    const translationSourceHash = _this.generateSourceHash();
    let translation = _this.getExistingTranslationForLocale(locale);
    if (!translation || (translation.autoTranslated && translation[options.hashField] !== translationSourceHash))
      try {
        // retrieve a translation by provider
        const nativeLanguage = this.get(options.languageField);
        const translationsMap = await generateAutoTranslation(nativeLanguage, locale, translationSource, options.translator);
        const translationOverrides = generateObjectFromPathMap<Partial<T>>(translationsMap);
        const translationMeta = {
          [options.hashField]: _this.generateSourceHash(),
          [options.languageField]: locale
        };
        translation = { ...translationMeta, ...translationOverrides, autoTranslated: true };
        await _this.updateOrReplaceTranslation(translation);
      } catch (err) {
        console.error(`An error occured while auto-translating an entity: ${err instanceof Error ? err.message : err}`);
      }
    return translation;
  };

  /**
   * returns a plain object of the entity with translatable fields overriden
   * @param locale
   * @returns {Promise<Object>}
   */
  schema.methods.translate = async function translate(locale: string): Promise<TranslatedPlainObject<T>> {
    const _this = this as TranslatableDocument<T>;
    const nativeLanguage = this.get([options.languageField]);

    let entityTranslation: TranslationDocument<T> | undefined;

    if (nativeLanguage !== locale) {
      entityTranslation = await _this.getTranslation(locale);
    }

    const translationMeta: TranslationDocumentMeta = {
      [options.hashField]: entityTranslation?.[options.hashField] || _this.get(options.hashField),
      [options.languageField]: entityTranslation?.[options.languageField] || nativeLanguage,
      autoTranslated: entityTranslation?.autoTranslated || false
    };

    const { translation, _id, __v, ...entityToTranslate } = _this.toObject();

    // in case no translation is returned, the native entity is returned as failsafe
    const appliedTranslation = applyTranslation(entityToTranslate, entityTranslation);

    // add supported languages at root level for translation actions
    const translatedMeta: TranslatedDocumentMeta = {
      supportedLanguages: _this.getSupportedLanguages(),
      nativeLanguage
    };

    return Object.assign(appliedTranslation, translatedMeta, translationMeta) as TranslatedPlainObject<T>;
  };
}
