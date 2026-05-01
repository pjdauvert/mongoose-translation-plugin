import 'jest-extended';

import mongoose, { type Default__v } from 'mongoose';

import type { TranslatableDocument, TranslatedPlainObject, TranslationProvider, TranslatorFunction } from '../mongoose.types';
import { translationPlugin } from '../plugin';
import { clearDatabase, closeDatabase, connect, type MongoMemoryServerHelper } from './db.setup';

const Schema = mongoose.Schema;

// TranslationFunction is a function that takes a payload and returns a promise that resolves to an array of strings
// The payload is an object with the following properties:
// - text: string[]
// - from: string
// - to: string
// The plugin option `translatorFunction` is now deprecated in favor of `provider`
// Though `translatorFunction` is still supported for compatibility reasons, it is recommended to use `provider` with a `TranslationProvider` instance instead.

// This translation provider mock replaces an implementation of a provider like Google Translate or Deepl.
// For test purpose, translated strings are simply prefixed by the languages from and to.

const mockTranslationFunction: TranslatorFunction = jest.fn(async (payload) => {
  return Promise.resolve(payload.text.map((text) => `${payload.from}-${payload.to}-${text}`));
});

class TestTranslator implements TranslationProvider {
  public getTranslations: TranslatorFunction = mockTranslationFunction;
}

let memoryDB: MongoMemoryServerHelper;
beforeAll(async () => {
  memoryDB = await connect('mongoose-translation-plugin');
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase(memoryDB);
});

describe('Mongoose translation plugin test', () => {
  it('Mongoose translation plugin - simple model', async () => {
    interface ISimple {
      translatableStringField: string;
      nonTranslatableStringField: string;
      other: number;
    }

    type ISimpleDocument = ISimple & Default__v<TranslatableDocument<ISimple>>;

    const schema = new Schema({
      translatableStringField: { type: String, required: true, translatable: true },
      nonTranslatableStringField: String,
      other: Number
    });

    schema.plugin(translationPlugin, { provider: new TestTranslator() });

    const SimpleModel = mongoose.model<ISimpleDocument>('SimpleModel', schema);

    await SimpleModel.create({
      translatableStringField: 'This is a translatable field',
      nonTranslatableStringField: 'This field is not translatable',
      other: 12
    });

    const entity = (await SimpleModel.findOne({})) as ISimpleDocument;

    // check plugin defaults are set
    expect(entity.language).toBe('en'); // default language added
    expect(entity.translation).toBeArray(); // translation array created
    expect(entity.sourceUpdatedAt).toBeDefined(); // source timestamp set on creation
    expect(entity.sourceUpdatedAt).toBeInstanceOf(Date); // timestamp is a Date

    // no-op operation (native language)
    let translation = await entity.translate('en');
    expect(entity.translation).toBeEmpty(); // no translation created for native language
    expect(entity.__v).toBe(0); // document version was not altered
    expect(entity.translatableStringField).toBe(translation.translatableStringField); // translatable field unchanged

    translation = await entity.translate('fr');

    // check that entity now has one translation
    expect(entity.translation).toBeArrayOfSize(1); // new translation object created
    expect(entity.getSupportedLanguages()).toIncludeAllMembers(['en', 'fr']); // supported language added
    expect(entity.__v).toBe(1); // document version was altered
    expect(translation.nativeLanguage).toBe('en'); // native language accessor set
    expect(translation.translatableStringField).toBe(`en-fr-${entity.translatableStringField}`); // translation mock succeeded
    // added fields
    expect(translation.sourceUpdatedAt).toBeTruthy(); // translation source timestamp recorded
    expect(translation.autoTranslated).toBeTrue(); // auto-translation flag set
    // other fields are also retrieved
    expect(entity.nonTranslatableStringField).toBe(translation.nonTranslatableStringField); // untouched string field
    expect(entity.other).toBe(translation.other); // untouched other field
  });

  it('Mongoose translation plugin - deprecated translatorFunction compatibility', async () => {
    interface ISimple2 {
      translatableStringField: string;
    }
    type ISimpleDocument2 = ISimple2 & TranslatableDocument<ISimple2>;
    const schema = new Schema({
      translatableStringField: { type: String, required: true, translatable: true }
    });
    schema.plugin(translationPlugin, { translator: mockTranslationFunction });
    const SimpleModel2 = mongoose.model<ISimpleDocument2>('SimpleModel2', schema);
    await SimpleModel2.create({
      language: 'en',
      translatableStringField: 'This is a translatable field'
    });
    const entity = (await SimpleModel2.findOne({})) as ISimpleDocument2;
    const translation = await entity.translate('fr');
    expect(translation.translatableStringField).toBe(`en-fr-${entity.translatableStringField}`);
    expect(mockTranslationFunction).toHaveBeenCalledOnce();
  });

  it('Mongoose translation plugin - missing translator function', async () => {
    const schema = new Schema({
      translatableStringField: { type: String, required: true, translatable: true }
    });

    // Neither provider nor translator is provided
    expect(() => schema.plugin(translationPlugin, {})).toThrow('[Options]: a translation option is required (provider or translator)');
  });

  it('Mongoose translation plugin - invalid translation payload', async () => {
    interface ISimple3 {
      translatableStringField: string;
    }
    type ISimpleDocument3 = ISimple3 & TranslatableDocument<ISimple3>;
    const schema = new Schema({
      translatableStringField: { type: String, required: true, translatable: true }
    });

    const invalidTranslator: TranslatorFunction = jest.fn(async () => {
      return Promise.resolve('invalid response' as unknown as string[]);
    });

    schema.plugin(translationPlugin, { translator: invalidTranslator });
    const SimpleModel = mongoose.model<ISimpleDocument3>('SimpleModel3', schema);

    await SimpleModel.create({
      language: 'en',
      translatableStringField: 'This is a translatable field'
    });

    const entity = (await SimpleModel.findOne({})) as ISimpleDocument3;

    const translation = await entity.translate('fr');
    // The translation provider failure should not alter the flow of the plugin
    await expect(translation.translatableStringField).toBe(entity.translatableStringField);
  });

  it('Mongoose translation plugin - translation failure', async () => {
    interface ISimple4 {
      translatableStringField: string;
    }
    type ISimpleDocument4 = ISimple4 & TranslatableDocument<ISimple4>;
    const schema = new Schema({
      translatableStringField: { type: String, required: true, translatable: true }
    });

    const failingTranslator: TranslatorFunction = jest.fn(async () => {
      throw new Error('Translation service unavailable');
    });

    schema.plugin(translationPlugin, { translator: failingTranslator });
    const SimpleModel4 = mongoose.model<ISimpleDocument4>('SimpleModel4', schema);

    await SimpleModel4.create({
      language: 'en',
      translatableStringField: 'This is a translatable field'
    });

    const entity = (await SimpleModel4.findOne({})) as ISimpleDocument4;
    const translation = await entity.translate('fr');

    // The translation provider failure should not alter the flow of the plugin
    await expect(translation.translatableStringField).toBe(entity.translatableStringField);
  });

  it('Mongoose translation plugin - array model', async () => {
    interface IChild {
      child: string;
      childNT: string;
    }

    interface IParent {
      nonTranslatableField: string;
      parent: string[];
      parent2: IChild[];
    }

    const childSchema = new Schema<IChild>(
      {
        child: { type: String, translatable: true },
        childNT: String
      },
      { _id: false }
    );

    const schema = new Schema({
      nonTranslatableField: String,
      parent: [{ type: String, translatable: true }],
      parent2: [childSchema]
    });

    type IArrayDocument = IParent & TranslatableDocument<IParent>;

    schema.plugin(translationPlugin, {
      provider: new TestTranslator()
    });

    const ArrayModel = mongoose.model<IArrayDocument>('ArrayModel', schema);

    const nativeObject = {
      nonTranslatableField: 'Not translated',
      parent: ['One', 'Two', 'Three'],
      parent2: [{ child: 'One', childNT: 'Not translated' }, { child: 'Two' }, { child: 'Three' }]
    };

    await ArrayModel.create(nativeObject);
    const entity = (await ArrayModel.findOne({})) as IArrayDocument;
    const translation = await entity?.translate('de');

    expect(translation.nonTranslatableField).toBe(nativeObject.nonTranslatableField);

    translation.parent.forEach((value, index) => {
      expect(value).toBe(`en-de-${nativeObject.parent[index]}`);
    });

    translation.parent2.forEach((value, index) => {
      expect(value.child).toBe(`en-de-${nativeObject?.parent2[index]?.child}`);
    });

    expect(translation?.parent2[0]?.childNT).toBe(nativeObject?.parent2[0]?.childNT);
  });

  it('Mongoose translation plugin - nested document model', async () => {
    interface IChildListItem {
      childListItem: string;
      childListItemNT1?: string;
      childListItemNT2?: number;
      childListItemNT3?: boolean;
    }

    interface IChild {
      childValue: string;
      childValueNT?: string;
      childList: IChildListItem[];
      childArray?: string[];
    }

    interface IParent {
      rootNT: string;
      parent: {
        child: IChild[];
        parentNT: string;
      };
    }

    const childSchema = new Schema<IChild>(
      {
        childValue: { type: String, translatable: true },
        childValueNT: String,
        childList: [
          {
            _id: false,
            childListItem: { type: String, translatable: true },
            childListItemNT1: String,
            childListItemNT2: Number,
            childListItemNT3: Boolean
          }
        ],
        childArray: { type: [String], translatable: true }
      },
      { _id: false }
    );

    const schema = new Schema({
      rootNT: String,
      parent: {
        child: [childSchema],
        parentNT: String
      }
    });

    schema.plugin(translationPlugin, {
      provider: new TestTranslator()
    });

    type INestedDocument = IParent & TranslatableDocument<IParent>;
    const NestedModel = mongoose.model<INestedDocument>('NestedModel', schema);

    const nativeObject: IParent = {
      rootNT: 'Not translated',
      parent: {
        parentNT: 'Not translated',
        child: [
          {
            childValueNT: 'Not translated',
            childValue: 'First child value',
            childList: [
              {
                childListItem: 'First list item of first child value',
                childListItemNT1: 'Not translated',
                childListItemNT2: 0,
                childListItemNT3: false
              },
              { childListItem: 'Second list item of first child value' },
              { childListItem: 'Third list item of first child value' }
            ],
            childArray: ['tomatoes', 'apples', 'cucumber']
          },
          {
            childValue: 'Second child value',
            childList: [
              { childListItem: 'First list item of second child value' },
              { childListItem: 'Second list item of second child value' },
              { childListItem: 'Third list item of second child value' }
            ]
          },
          {
            childValue: 'Third child value',
            childList: [
              { childListItem: 'First list item of third child value' },
              { childListItem: 'Second list item of third child value' },
              { childListItem: 'Third list item of third child value' }
            ]
          }
        ]
      }
    };

    await NestedModel.create(nativeObject);
    const entity = (await NestedModel.findOne({})) as INestedDocument;
    const translation = await entity.translate('fr');

    const indexes = Array(3)
      .fill(undefined)
      .map((_x, i) => i);

    for (const childIndex of indexes) {
      expect(translation?.parent?.child[childIndex]?.childValue).toBe(`en-fr-${nativeObject?.parent?.child[childIndex]?.childValue}`);

      for (const childListIndex of indexes) {
        expect(translation?.parent?.child[childIndex]?.childList[childListIndex]?.childListItem).toBe(
          `en-fr-${nativeObject.parent.child[childIndex]?.childList[childListIndex]?.childListItem}`
        );
      }
    }
    for (const childArrayIndex of indexes) {
      expect(translation.parent.child[0]?.childList[childArrayIndex]?.childListItem).toBe(
        `en-fr-${nativeObject.parent.child[0]?.childList[childArrayIndex]?.childListItem}`
      );
    }

    expect(translation.rootNT).toBe(nativeObject.rootNT);
    expect(translation.parent.parentNT).toBe(nativeObject.parent.parentNT);
    expect(translation.parent.child[0]?.childValueNT).toBe(nativeObject.parent.child[0]?.childValueNT);
    expect(translation.parent.child[0]?.childList[0]?.childListItemNT1).toBe(nativeObject.parent.child[0]?.childList[0]?.childListItemNT1);
    expect(translation.parent.child[0]?.childList[0]?.childListItemNT2).toBe(nativeObject.parent.child[0]?.childList[0]?.childListItemNT2);
    expect(translation.parent.child[0]?.childList[0]?.childListItemNT3).toBe(nativeObject.parent.child[0]?.childList[0]?.childListItemNT3);
  });

  it('Mongoose translation plugin - options', async () => {
    interface ISimpleValue {
      value: string;
    }

    const schema = new Schema({
      value: { type: String, translatable: true }
    });

    const langOptions = {
      languageField: 'langue',
      defaultLanguage: 'fr',
      provider: new TestTranslator()
    } as const;

    schema.plugin(translationPlugin, langOptions);

    type ISimpleDocument = ISimpleValue & TranslatableDocument<ISimpleValue, typeof langOptions>;
    const SimpleModelOption = mongoose.model<ISimpleDocument>('SimpleModelOption', schema);

    await SimpleModelOption.create({
      value: 'Ceci est un champs traductible'
    });

    const entity = (await SimpleModelOption.findOne({})) as ISimpleDocument;

    const translation = await entity.translate('en');

    expect(entity.langue).toBe('fr'); // custom language field set with proper default
    expect(entity.sourceUpdatedAt).toBeDefined(); // source timestamp set
    expect(entity.sourceUpdatedAt).toBeInstanceOf(Date); // timestamp is a Date
    expect(translation.langue).toBe('en'); // translation language is in the proper field
    expect(translation.sourceUpdatedAt).toBeDefined(); // translation timestamp is set
    expect(translation.value).toBe('fr-en-Ceci est un champs traductible');
  });

  it('Mongoose translation plugin - non-native language', async () => {
    interface ISimpleValue {
      value: string;
    }

    const schema = new Schema({
      value: { type: String, translatable: true }
    });

    schema.plugin(translationPlugin, {
      provider: new TestTranslator()
    });

    type ISimpleDocument = ISimpleValue & TranslatableDocument<ISimpleValue>;
    const SimpleModelNonNative = mongoose.model<ISimpleDocument>('SimpleModelNonNative', schema);

    await SimpleModelNonNative.create({
      value: 'Ceci est un champs traductible',
      language: 'fr'
    });

    const entity = await SimpleModelNonNative.findOne({});
    const translation = (await entity?.translate('en')) as TranslatedPlainObject<ISimpleValue>;

    expect(entity?.language).toBe('fr');
    expect(entity?.translation[0].language).toBe('en');
    expect(translation.language).toBe('en');
    expect(translation.value).toBe('fr-en-Ceci est un champs traductible');
  });

  it('Mongoose translation plugin - sanitize value', async () => {
    interface ISanitizedValue {
      sanitized: string;
    }

    const schema = new Schema({
      sanitized: { type: String, translatable: true }
    });

    const simpleHTMLTagStripper = (string: string): string => string.replace(/<[^>]+?>/gi, '');

    schema.plugin(translationPlugin, {
      provider: new TestTranslator(),
      sanitizer: simpleHTMLTagStripper
    });

    type ISanitizedDocument = ISanitizedValue & TranslatableDocument<ISanitizedValue>;
    const SanitizedModel = mongoose.model<ISanitizedDocument>('SanitizedModel', schema);

    const expected = 'This text is embedded';

    await SanitizedModel.create({
      sanitized: `<p class="centered"><strong>${expected}</strong></p>`
    });
    const entity = await SanitizedModel.findOne({});
    const translation = await entity?.translate('de');
    expect(translation?.sanitized).toBe(`en-de-${expected}`);
  });

  it('Mongoose translation plugin - translation persistence', async () => {
    // Once translated and stored, the translation is reused without calling the translator
    // unless a translatable field has been modified (sourceUpdatedAt > translation.sourceUpdatedAt).

    interface ISimplePersistance {
      value: string;
      nested: { value: string }[];
    }

    const schema = new Schema({
      value: { type: String, translatable: true },
      nested: [{ value: { type: String, translatable: true } }]
    });

    const provider = new TestTranslator();

    schema.plugin(translationPlugin, {
      provider
    });

    type IPersistenceDocument = ISimplePersistance & TranslatableDocument<ISimplePersistance>;
    const SimpleModelPersitance = mongoose.model<IPersistenceDocument>('SimpleModelPersitance', schema);

    const source: ISimplePersistance = {
      value: 'This field is translatable',
      nested: [{ value: 'This first nested field is translatable' }, { value: 'This second nested field is translatable' }]
    };

    await SimpleModelPersitance.create(source);

    const entity = (await SimpleModelPersitance.findOne({})) as IPersistenceDocument;

    // First translation — translator should be called once
    await entity.translate('fr');
    expect(entity.translation).toBeArrayOfSize(1);
    expect(provider.getTranslations).toHaveBeenCalledOnce();

    // Second translate call — no change, translator should NOT be called again
    await entity.translate('fr');
    expect(provider.getTranslations).toHaveBeenCalledOnce();

    // Modify a translatable field and save — sourceUpdatedAt is bumped
    if (entity.nested[1]) {
      entity.nested[1].value += ' modified';
    }
    await entity.save();

    // Third translate call — source is now newer than translation, re-translation expected
    await entity.translate('fr');
    expect(provider.getTranslations).toHaveBeenCalledTimes(2);
    expect(entity.translation[0].nested?.[1]?.value).toEndWith('modified');

    // Mark translation as non-auto and modify again — translator should NOT be called (manual translation preserved)
    entity.translation[0].autoTranslated = false;
    if (entity.nested[0]) {
      entity.nested[0].value += ' modified';
    }
    await entity.save();
    const translation = await entity.translate('fr');
    expect(provider.getTranslations).toHaveBeenCalledTimes(2); // still 2 — manual translation not overridden
    expect(translation.nested[0]?.value).not.toEndWith('modified');
  });

  it('Mongoose translation plugin - sourceUpdatedAt only updated on translatable field change', async () => {
    // Verifies that saving a document without touching translatable fields
    // does NOT bump sourceUpdatedAt.

    interface IModel {
      translatableField: string;
      nonTranslatableField: string;
    }

    type IModelDocument = IModel & TranslatableDocument<IModel>;

    const schema = new Schema({
      translatableField: { type: String, translatable: true },
      nonTranslatableField: String
    });

    schema.plugin(translationPlugin, { provider: new TestTranslator() });

    const TimestampModel = mongoose.model<IModelDocument>('TimestampModel', schema);

    await TimestampModel.create({
      translatableField: 'Original value',
      nonTranslatableField: 'Not translatable'
    });

    const entity = (await TimestampModel.findOne({})) as IModelDocument;
    const originalTimestamp = entity.sourceUpdatedAt;

    // Wait 10ms to ensure any new Date() would differ
    await new Promise((r) => setTimeout(r, 10));

    // Save without modifying any translatable field
    entity.nonTranslatableField = 'Updated non-translatable';
    await entity.save();

    const entityAfter = (await TimestampModel.findOne({})) as IModelDocument;
    expect(entityAfter.sourceUpdatedAt.getTime()).toBe(originalTimestamp.getTime()); // timestamp unchanged

    // Now modify a translatable field
    entityAfter.translatableField = 'Updated translatable';
    await entityAfter.save();

    const entityFinal = (await TimestampModel.findOne({})) as IModelDocument;
    expect(entityFinal.sourceUpdatedAt.getTime()).toBeGreaterThan(originalTimestamp.getTime()); // timestamp bumped
  });
});
