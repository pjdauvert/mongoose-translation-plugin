# API Documentation

Mongoose Translation Plugin adds some utility methods and attributes to your Schema.
This document describes the added methods and attributes.

## Translation Provider

The Translation Provider is an external API service that can translate a text from one language to another.

The plugin requires a translator function to work, which accepts the following arguments:

```typescript
interface TranslatablePayload {
    text: string[]; // texts to translate
    from: string; // original text locale
    to: string; // destination locale to use
}

type TranslatorFunction = (translationParams: TranslatablePayload) => Promise<string[]>;
```

Ensure that the language codes are supported by the translation provider.
An example with Google Translate is given in the repository [here](https://github.com/pjdauvert/mongoose-translation-plugin/tree/main/src/examples/google-translate.ts).

## Added Attributes

### Language

The `language` attribute contains the current language of the document.
It is a string that represents the language code of the document, and is used to retrieve the correct translation towards the translation provider. 
It must be a valid language code, as defined by the [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1) standard, and be supported by the translation provider.

Note that translation language not supported can still be used, as long as the translation document is manually managed, having the `autoTranslated` attribute set to `false`.

The attribute is set at the root of the document, and can be renamed with the `languageField` option, with the plugin setup.
The same attribute is used in the translation sub-documents, to store the language of the translation.

### Source Hash

The `sourceHash` attribute contains the hash of all the translatable fields of the document.
It is a string that represents the hash of the translatable fields of the document, 
and is used to determine if the translation needs to be re-fetched from the translation provider. 
It is a snapshot of the document's translatable fields at the moment the translation has been requested towards the Translation Provider.

The attribute is set at the root of the document, and can be renamed with the `hashField` option, with the plugin setup.
The same attribute is used in the translation sub-documents, to store the language of the translation.

### Translations

The `translation` attribute contains all the translations of the document.
Each sub-document represents a translation in a specific language, and is stored in an array.

The attribute name is yet not configurable.

#### Sub-document

The sub-document is a partial document that contains only the translatable fields of the original document.

In addition, the sub-document contains the following meta-information attributes:

* The `language` attribute contains the current language of the document (will be modified by the `languageField` option too).

* The `sourceHash` attribute contains the hash of all the translatable fields of the document (will be modified by the `hashField` option too).

* The `autoTranslated` attribute is set to `true` if the translation was automatically fetched from the translation provider.

If the sourceHash changes, the plugin will automatically re-fetch the translation from the translation provider,
unless `autoTranslated` is set to `false`.
This allows you to manually manage the translation of a locale, and prevent the plugin from re-fetching the translation.
If the native language sourceHash is different from the target language sourceHash,
it is easy to warn the content manager that a custom translation needs to be revised.


## Instance Methods

### `getSupportedLanguages()` (used internally)

The `getSupportedLanguages` method retrieves the list of all locales available for the document, including the native language.

### `getExistingTranslationForLocale(locale: string)` (used internally)

The `getExistingTranslationForLocale` method retrieves the translation for a specific locale available in the `tanslation` array.

### `updateOrReplaceTranslation(locale: string, translation: object)` (used internally)

The `updateOrReplaceTranslation` method manually manages the translation for a locale, placing or replacing the translation object in the `translation` array according to the locale.

### `translationSourceMap()` (used internally)

The `translationSourceMap` method retrieves a map of the translatable fields paths of the document, with the corresponding original language.

### `generateSourceHash` (used internally)

Creates a hash of the translation source fields mapped by the function above.

### `getTranslation` (used internally)

This method retrieves the translation of the document in a specific language, 
or fetches it from the translation provider if it does not exist or if the source hash of the translation sub-document is not the same as the native source hash and the `autoTranslated` attribute is set to `true`.

### `translate` 

The `translate` method retrieves the document in a specific language as a plain object.

The output is a plain object that contains the complete document with the translatable fields of the document, translated in the specified language,
with some additional meta-information attributes:
* `nativeLanguage`: The native language of the original document. 
* `supportedLanguages`: An array of all the existing languages for the document.

Examples of various nested cases can be seen in the [test suite](https://github.com/pjdauvert/mongoose-translation-plugin/tree/main/src/__tests__/plugin.test.ts).

