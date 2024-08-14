# Mongoose Translation Plugin

This translation plugin is designed for [Mongoose](https://mongoosejs.com) together with a
translation provider such as [Google Translate](https://cloud.google.com/translate) or [DeepL](https://www.deepl.com/translator).

It is a simple plugin that allows you to translate your Mongoose models by simply adding `translatable` to any attribute
of a mongoose Schema and store overrides making contents searchable in any translated language.

[![codecov](https://codecov.io/github/pjdauvert/mongoose-translation-plugin/graph/badge.svg?token=S9U050U1VD)](https://codecov.io/github/pjdauvert/mongoose-translation-plugin)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE.md)

## How it works
The plugin will automatically create a new attribute `translation` for the translations and will handle the translation
of the attributes of the schema that have been flagged.

The translations are stored within each document in the `translation` attribute.

If a translation is not found for a given locale, the plugin allows you to retrieve the translation from the original document to that locale by requesting a translation provider

The translations provided can be overridden by the user.

The original document's translatable fields are hashed, in order to re-fetch the translation from the original document if any change occur in the native document's translatable attributes.

## Installation 

```bash
> npm install mongoose-translation-plugin
```

Mongoose Translation Plugin does not require `mongoose` dependencies directly but expects you
to have the dependency installed.

## Usage

The plugin is installed directly on the schema you want to translate. The Schema attributes that you want to translate should be flagged with `translatable` as shown below. 

### Prerequisites

The plugin require a translation provider to be passed as an argument. The translation provider must be of type `TranslatorFunction`.

```typescript
(translationParams: TranslatablePayload) => Promise<string[]>;
```

The translation params (of type `TranslatablePayload`) are as follows:
- _from_: The original locale **string** of the text supported by the translation provider
- _to_: The target locale **string** of the text supported by the translation provider
- _text_: The text to be translated, as an **array of strings**.

The function must preserve the order of the strings.
A sanitizer function can be passed as an option to sanitize the text before sending it to the translation provider.

An example with _Google Translate_ is given in the repository.

### Plugin Mongoose Schema

First you need to plugin into the schema you want translatable, and define the attributes you want translatable by adding `translatable: true` in the schema definition.
If the Schema contains nested objects, you can also define the nested object as translatable.

```typescript
import { Schema } from 'mongoose';
import { type TranslatableDocument, translationPlugin } from 'mongoose-translation-plugin';
import { translator } from './path/to/translator';

interface ISimple {
  translatableStringField: string;
  nonTranslatableStringField: string;
  other: number;
}

type ISimpleDocument = ISimple & TranslatableDocument<ISimple>;

const schema = new Schema({
  translatableStringField: { type: String, translatable: true },
  nonTranslatableStringField: String,
  other: Number
});

schema.plugin(translationPlugin, { translator });

export const SimpleModel = mongoose.model<ISimpleDocument>('SimpleModel', schema);
```

You're free to define your model how you like. Mongoose Translation Plugin will add :
- a `language` attribute (can be renamed with options)
- a `sourceHash` attribute (can be renamed with options)
- a `translation` attribute that contains all the translations
- a `translate` method to retrieve the document in a specific language as plain object
- a `updateOrReplaceTranslation` method to manually manage the translation of a locale.

Additionally, Mongoose Translation Plugin adds some other utility methods to your Schema. 
See the [API Documentation](docs/api.md) section for more details.

### Options

The plugin accepts an options object as a second argument. The options are as follows:

- `languageField` (default: 'language'): The name of the attribute that contains the language of the document.
- `hashField` (default: 'sourceHash'): The name of the attribute that contains the hash of the translatable fields.
- ~~`translationField` (default: 'translation'): The name of the attribute that contains the translations.~~ (To be implemented)
- `translator`: The translation provider function.
- `sanitizer`: A function that will be called to sanitize the text before sending it to the translation provider.

### Translation

The plugin will automatically translate the translatable fields of the document when the function `translate` is called.
Nested objects are also supported.

```typescript
const document = await SimpleModel.create({ translatableStringField: 'Hello', nonTranslatableStringField: 'World', other: 42 });
const documentTranslation = await document.translate('fr');
```

#### Output

The `documentTranslation` is a plain object as follows:
```json
{
  "nativeLanguage": "en",
  "supportedLanguages": ["en", "fr"],
  "language": "fr",
  "sourceHash": "<The hash of all the translatable fields>",
  "autoTranslated": true,
  "translatableStringField": "Bonjour",
  "nonTranslatableStringField": "World",
  "other": 42
}
```

### Override an Automatic Translation

This feature is not implemented yet in the plugin, but as a workaround, it can be done manually
by calling the `updateOrReplaceTranslation` method, and ensuring that `autoTranslate` is set to `false`.

### Limitations

The plugin does not support populated fields, and will not translate the populated fields of the document.
The models we had implemented so far did not require this feature, as they where pretty simple, and could be combined separately,
but it could be implemented in the future.

## Contribute

Please respect the [Code of Conduct](CODE_OF_CONDUCT.md) to submit your improvement change requests. 

## License

Mongoose Translation Plugin is licensed under the [AGPL license](LICENSE.md).