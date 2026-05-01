import { Schema, type SchemaDefinition } from 'mongoose';

import type { TranslatableDocument, TranslatedDocumentMeta, TranslatedPlainObject, TranslationDocument, TranslationOptions } from './mongoose.types';
import { buildTranslationSchema, getTranslatablePaths } from './schema';
import { applyTranslation, generateAutoTranslation, generateObjectFromPathMap, mapTranslationSource } from './tools';

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

  // deprecate translator option
  if (opts.translator) console.warn('[Options]: translator option is deprecated, use provider instead');

  if (opts.provider && opts.translator) {
    console.warn('[Options]: both provider and translator options are provided, translator option will be ignored');
  }

  const translator = opts.provider?.getTranslations || opts.translator;
  if (!translator) throw new Error('[Options]: a translation option is required (provider or translator)');

  const options: Required<Omit<TranslationOptions, 'provider'>> & { timestampField: 'sourceUpdatedAt' } = {
    translator,
    sanitizer: opts.sanitizer || ((value: string): string => value),
    defaultLanguage: opts.defaultLanguage || 'en',
    languageField: opts.languageField || 'language',
    timestampField: 'sourceUpdatedAt'
  };

  const pathsToTranslate = getTranslatablePaths(schema);

  // add the timestamp field (Date) and language field to the schema
  const schemaFields: SchemaDefinition = {
    [options.timestampField]: { type: Date },
    [options.languageField]: { type: String, default: options.defaultLanguage }
  };

  // add native entity translation related properties
  schema.add(schemaFields);

  // add translation schema to native entity based on translatable paths
  const translationSchemaDefinition = buildTranslationSchema(schema, schemaFields, pathsToTranslate);
  const translationSchema = new Schema(translationSchemaDefinition, { _id: false });
  schema.add({ translation: [translationSchema] });

  // WeakSet used to suppress timestamp updates during internal translation saves
  const internalSaveSet = new WeakSet<object>();

  schema.pre<TranslatableDocument<T>>('save', function updateSourceTimestamp() {
    // Skip if this save was triggered internally by updateOrReplaceTranslation
    if (internalSaveSet.has(this)) {
      return;
    }
    // Update the timestamp only when at least one translatable source field has been modified.
    // We also check the parent path for array fields (e.g. 'nested' when path is 'nested.value').
    const isNew = this.isNew;
    const hasTranslatableChange =
      isNew ||
      pathsToTranslate.some((path) => {
        if (this.isModified(path)) return true;
        // For array sub-paths, also check parent segments
        const segments = path.split('.');
        return segments.some((_, i) => i > 0 && this.isModified(segments.slice(0, i).join('.')));
      });
    if (hasTranslatableChange) {
      // Ensure the timestamp is strictly monotonic: never write a value <= the existing one
      const existing = this.get(options.timestampField) as Date | undefined;
      const now = new Date();
      this.set(options.timestampField, existing && now <= existing ? new Date(existing.getTime() + 1) : now);
    }
  });

  // Query-based writes (updateOne / updateMany / findOneAndUpdate) bypass pre('save').
  // Inject the timestamp into the update's $set when any translatable path is being changed.
  function injectSourceTimestampInUpdate(update: Record<string, unknown>): void {
    const normalize = (path: string): string =>
      path
        .split('.')
        .filter((segment) => !/^\d+$/.test(segment))
        .join('.');

    // Collect paths from all operator objects AND top-level non-operator keys
    const changedKeys = new Set<string>();
    for (const key of Object.keys(update)) {
      if (key.startsWith('$')) {
        const operatorObj = update[key];
        if (operatorObj && typeof operatorObj === 'object') {
          for (const path of Object.keys(operatorObj as Record<string, unknown>)) {
            changedKeys.add(normalize(path));
          }
        }
      } else {
        changedKeys.add(normalize(key));
      }
    }

    const $set = update.$set as Record<string, unknown> | undefined;

    // Mirror the save hook: match a direct translatable path or any parent array segment
    const hasTranslatableChange = pathsToTranslate.some((path) => {
      const normalizedPath = normalize(path);
      if (changedKeys.has(normalizedPath)) return true;
      const segments = normalizedPath.split('.');
      return segments.some((_, i) => i > 0 && changedKeys.has(segments.slice(0, i).join('.')));
    });
    if (hasTranslatableChange) {
      // Merge into $set rather than replacing the whole update object
      update.$set = Object.assign({}, $set, { [options.timestampField]: new Date() });
    }
  }

  schema.pre('updateOne', function () {
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (update) injectSourceTimestampInUpdate(update);
  });

  schema.pre('updateMany', function () {
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (update) injectSourceTimestampInUpdate(update);
  });

  schema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (update) injectSourceTimestampInUpdate(update);
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
    // Mark this save as an internal translation update to prevent bumping the source timestamp
    internalSaveSet.add(this);
    try {
      await this.save();
    } finally {
      internalSaveSet.delete(this);
    }
  };

  schema.methods.translationSourceMap = function translationSourceMap(): Map<string, string> {
    return mapTranslationSource(this.toObject(), pathsToTranslate, options.sanitizer);
  };

  /**
   * Returns the current value of the source timestamp field.
   */
  schema.methods.getSourceUpdatedAt = function getSourceUpdatedAt(): Date {
    return this.get(options.timestampField) as Date;
  };

  schema.methods.getTranslation = async function getTranslation(locale: string): Promise<TranslationDocument<T>> {
    const _this = this as TranslatableDocument<T>;
    const translationSource = _this.translationSourceMap();
    const sourceUpdatedAt: Date = _this.getSourceUpdatedAt();
    let translation = _this.getExistingTranslationForLocale(locale);

    // A (re-)translation is needed when:
    // - no translation exists yet, OR
    // - the translation was auto-generated AND the source has been updated after the translation was last generated
    const rawTranslationTimestamp = (translation as Record<string, unknown>)?.[options.timestampField] as Date | string | undefined;
    const translationTimestamp = rawTranslationTimestamp ? new Date(rawTranslationTimestamp as string | Date) : null;
    const isStale = !translationTimestamp || sourceUpdatedAt.getTime() > translationTimestamp.getTime();

    if (!translation || (translation.autoTranslated && isStale))
      try {
        // retrieve a translation by provider
        const nativeLanguage = this.get(options.languageField);
        const translationsMap = await generateAutoTranslation(nativeLanguage, locale, translationSource, options.translator);
        const translationOverrides = generateObjectFromPathMap<Partial<T>>(translationsMap);
        const translationMeta = {
          [options.timestampField]: sourceUpdatedAt,
          [options.languageField]: locale
        };
        translation = { ...translationMeta, ...translationOverrides, autoTranslated: true } as unknown as TranslationDocument<T>;
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

    const translationMeta = {
      [options.timestampField]: (entityTranslation as Record<string, unknown>)?.[options.timestampField] ?? _this.get(options.timestampField),
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

    return Object.assign(appliedTranslation, translatedMeta, translationMeta) as unknown as TranslatedPlainObject<T>;
  };
}
