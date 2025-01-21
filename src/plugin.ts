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
  // check if provider is a Translation instance
  if (opts.provider && typeof opts.provider.getTranslations !== 'function') throw new Error('[Options]: provider must implement getTranslations method');
  // check if provided translator option is a function
  if (opts.translator && typeof opts.translator !== 'function') throw new Error('[Options]: translator must be a function: ({ text, from, to }) => [String]');
  // check if provided sanitizer option is a function
  if (opts.sanitizer && typeof opts.sanitizer !== 'function') throw new Error('[Options]: sanitizer must be a function: (String) => String');
  // check if provided defaultLanguage option is a string
  if (opts.defaultLanguage && typeof opts.defaultLanguage !== 'string') throw new Error('[Options]: defaultLanguage must be a string');
  // check if provided languageField option is a string
  if (opts.languageField && typeof opts.languageField !== 'string') throw new Error('[Options]: languageField must be a string');
  // check if provided hashField option is a string
  if (opts.hashField && typeof opts.hashField !== 'string') throw new Error('[Options]: hashField must be a string');

  // deprecate translator option
  if (opts.translator) console.warn('[Options]: translator option is deprecated, use provider instead');

  if (opts.provider && opts.translator) {
    console.warn('[Options]: both provider and translator options are provided, translator option will be ignored');
  }

  const translator = opts.provider?.getTranslations || opts.translator;
  if (!translator) throw new Error('[Options]: a translation option is required (provider or translator)');

  const options: Required<Omit<TranslationOptions, 'provider'>> = {
    translator,
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
