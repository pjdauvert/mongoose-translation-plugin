import 'jest-extended';

import mongoose, { type Default__v } from 'mongoose';

import type { TranslatableDocument, TranslatedPlainObject, TranslationProvider, TranslatorFunction } from '../mongoose.types';
import { translationPlugin } from '../plugin';
import { type MongoMemoryServerHelper, clearDatabase, closeDatabase, connect } from './db.setup';
const Schema = mongoose.Schema;

// TranslationFunction is a function that takes a payload and returns a promise that resolves to an array of strings
// The payload is an object with the following properties:
// - text: string[]
// - from: string
// - to: string
// The plugin option `translatorFunction` is now deprecated in favor of `provider`
// Though `translatorFunction` is still supported for compatibility reasons, it is recommended to use `provider` with a `TranslationProvider` instance instead.

// This translation provider mock replaces an implemetation of a provider like Google Translate or Deepl.
// for test purpose, and checks, translated strings will simply be
// prefixed by the languages from and to

const mockTranslationFunction: TranslatorFunction = jest.fn(async (payload) => {
  return Promise.resolve(payload.text.map((text) => `${payload.from}-${payload.to}-${text}`));
});

class TestTranslator implements TranslationProvider {
  public getTranslations: TranslatorFunction = mockTranslationFunction;
}

let memoryDB: MongoMemoryServerHelper;
beforeAll(async () => {
  // const one = await initDatabase('mongoose-translation-plugin-1');
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

    // check plugin defaults are set.
    expect(entity.language).toBe('en'); //default language added
    expect(entity.translation).toBeArray(); //translation array created

    expect(entity.sourceHash).toBeDefined(); //A source hash is needed to be inserted in the native language

    // no-op operation
    let translation = await entity.translate('en');
    // check that no translation was added
    expect(entity.translation).toBeEmpty(); //no translation created for native language;
    expect(entity.__v).toBe(0); //document version was not altered;
    expect(entity.translatableStringField).toBe(translation.translatableStringField); //translatable field similar

    translation = await entity.translate('fr');

    // check that entity now has one translation
    expect(entity.translation).toBeArrayOfSize(1); //new translation object created
    expect(entity.getSupportedLanguages()).toContainAllValues(['en', 'fr']); //supported language added
    expect(entity.__v).toBe(1); //document version was altered;
    expect(translation.nativeLanguage).toBe('en'); //native language accessor set
    expect(translation.translatableStringField).toBe(`en-fr-${entity.translatableStringField}`); //translation mock succeeded
    // added fields
    expect(translation.sourceHash).toBeTruthy(); //translation source hash recorded
    expect(translation.autoTranslated).toBeTrue(); //auto-translation flag set
    // other fields are also retrieved
    expect(entity.nonTranslatableStringField).toBe(translation.nonTranslatableStringField); //untouched string field
    expect(entity.other).toBe(translation.other); //untouched other field
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
      // Return invalid response (not an array)
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
    // the translation funtion returns the original value if it fails to translate.
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
    // the translation funtion returns the original value if it fails to translate.
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

    expect(translation.nonTranslatableField).toBe(nativeObject.nonTranslatableField); // Object non-translatable value is retrieved

    translation.parent.forEach((value, index) => {
      expect(value).toBe(`en-de-${nativeObject.parent[index]}`); // Single string values are translated;
    });

    translation.parent2.forEach((value, index) => {
      expect(value.child).toBe(`en-de-${nativeObject?.parent2[index]?.child}`); // Nested array's object properties are translated
    });

    expect(translation?.parent2[0]?.childNT).toBe(nativeObject?.parent2[0]?.childNT); // Nested array's object non-translatable value is retrieved
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

    // Array of indexes to loop in twice
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

    // Check non-translatable values are retrieved, even falsy;
    expect(translation.rootNT).toBe(nativeObject.rootNT); //Root non-translatable value is retrieved
    expect(translation.parent.parentNT).toBe(nativeObject.parent.parentNT); //Parent non-translatable value is retrieved
    expect(translation.parent.child[0]?.childValueNT).toBe(nativeObject.parent.child[0]?.childValueNT); //Parent non-translatable value is retrieved
    expect(translation.parent.child[0]?.childList[0]?.childListItemNT1).toBe(nativeObject.parent.child[0]?.childList[0]?.childListItemNT1); //Deep nested non-translatable string value is retrieved
    expect(translation.parent.child[0]?.childList[0]?.childListItemNT2).toBe(nativeObject.parent.child[0]?.childList[0]?.childListItemNT2); //Deep nested non-translatable numeric value is retrieved
    expect(translation.parent.child[0]?.childList[0]?.childListItemNT3).toBe(nativeObject.parent.child[0]?.childList[0]?.childListItemNT3); //Deep nested non-translatable boolean value is retrieved
  });

  it('Mongoose translation plugin - options', async () => {
    //  This aims to test the plugin options to modify name of the language
    //  property and the name of the array property holding the translations
    //  This makes the plugin compliant with the mongoDB text search.

    interface ISimpleValue {
      value: string;
    }

    const schema = new Schema({
      value: { type: String, translatable: true }
    });

    const langOptions = {
      languageField: 'langue',
      // translationField: 'traductions', //TODO : this option is not yet implemented
      defaultLanguage: 'fr',
      hashField: 'hash',
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

    expect(entity.langue).toBe('fr'); //the language field is redefined and set with the proper default
    expect(entity.hash).toBeDefined(); //the language field is redefined and set with the proper default
    // expect(entity.traductions[0].langue).toBe('en'); //the translation is set in the proper array, and has the proper language field
    expect(translation.langue).toBe('en'); //translation language is in the proper field
    expect(translation.hash).toBeDefined(); //translation language is in the proper field
    expect(translation.value).toBe('fr-en-Ceci est un champs traductible'); //translation is made form fr to en
  });

  it('Mongoose translation plugin - non-native language', async () => {
    // This aims to test the plugin options to modify name of the language
    //  property and the name of the array property holding the translations
    //  This makes the plugin compliant with the mongoDB text search.

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

    expect(entity?.language).toBe('fr'); //the language field is well stored
    expect(entity?.translation[0].language).toBe('en'); //the translation is set in the proper array, and has the proper language field
    expect(translation.language).toBe('en'); //translation language is in the proper field
    expect(translation.value).toBe('fr-en-Ceci est un champs traductible'); //translation is made form fr to en
  });

  it('Mongoose translation plugin - sanitize value', async () => {
    // The purpose of the sanitize function is to externalise the sanitizing processed function prior to translation
    // There is no function to reset the 'embedding' elements
    // Here we use a simple html tag stripper for example purpose, but the real goal
    // is to get rid of rich text DraftJS JSON stored on native elements,
    // and transform it to markdown which is usually well managed by automatic translator APIs

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
    expect(translation?.sanitized).toBe(`en-de-${expected}`); //Translation is sanitized
  });

  it('Mongoose translation plugin - translation persistence', async () => {
    //  This aims to test that the entity, once translated and the translation stored in the database,
    //  the translation is always used and the translator is no longer called,
    //  unless the native translatable fields hash has changed, and the translation is flagged with autoTranslated.

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
    await entity.translate('fr');
    expect(entity.translation).toBeArrayOfSize(1); //entity is translated and translation is stored
    expect(provider.getTranslations).toHaveBeenCalledOnce(); //translation function was called
    await entity.translate('fr');
    expect(provider.getTranslations).toHaveBeenCalledOnce(); //translation function was not called

    if (entity.nested[1]) {
      entity.nested[1].value += ' modified';
    }
    await entity.save();
    await entity.translate('fr');
    expect(provider.getTranslations).toHaveBeenCalledTimes(2); //the translation service is called as hash has changed
    expect(entity.translation[0].nested?.[1]?.value).toEndWith('modified'); //the new translation is stored

    entity.translation[0].autoTranslated = false;
    if (entity.nested[0]) {
      entity.nested[0].value += ' modified';
    }
    await entity.save();
    const translation = await entity.translate('fr');
    expect(provider.getTranslations).toHaveBeenCalledTimes(2); //translation function will not be called for this translation
    expect(translation.nested[0]?.value).not.toEndWith('modified'); //the translation is not automatically fetched
  });
});
