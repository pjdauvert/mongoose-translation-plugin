# API Documentation

Mongoose Translation Plugin adds some utility methods and attributes to your Schema.
This document describes the added methods and attributes.

## Translation Provider

The Translation Provider is an external API service that can translate a text from one language to another.

The plugin requires a translation provider to work. 

The translation provider must be an implementation of the `TranslationProvider` abstract class.

The `TranslationProvider` abstract class lets you implement your own translation provider, by implementing the `getTranslations` method as follows:

```typescript
interface TranslatablePayload {
    text: string[]; // texts to translate
    from: string; // original text locale
    to: string; // destination locale to use
}

type TranslatorFunction = (translationParams: TranslatablePayload) => Promise<string[]>;

class MyTranslator extends TranslationProvider {
    public getTranslations: TranslatorFunction = async (payload) => {
        // implement your own translation provider here
    }
}

```

Note that for compatibility reasons, the plugin options allow to pass an attribute `translator`, with a function of type `TranslatorFunction`.
This is deprecated and will be removed in the next major version.

Ensure that the language codes are supported by the translation provider.
An example with Google Translate is given in the repository [here](https://github.com/pjdauvert/mongoose-translation-plugin/tree/main/src/examples/google.translator.ts).
Another example with DeepL is given [here](https://github.com/pjdauvert/mongoose-translation-plugin/tree/main/src/examples/deepl.translator.ts).

## Added Attributes

### Language

The `language` attribute contains the current language of the document.
It is a string that represents the language code of the document, and is used to retrieve the correct translation towards the translation provider. 
It must be a valid language code, as defined by the [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1) standard, and be supported by the translation provider.

Note that translation language not supported can still be used, as long as the translation document is manually managed, having the `autoTranslated` attribute set to `false`.

The attribute is set at the root of the document, and can be renamed with the `languageField` option, with the plugin setup.
The same attribute is used in the translation sub-documents, to store the language of the translation.

### Source Updated At

The `sourceUpdatedAt` attribute is a `Date` timestamp set whenever a translatable field on the
document is modified and the document is saved. It is used to determine whether an existing
auto-translation is stale: if the native document's `sourceUpdatedAt` is more recent than the
stored translation's `sourceUpdatedAt`, the translation is automatically re-fetched from the
provider on the next `translate()` call.

The attribute is set at the root of the document and on every translation sub-document.
The field name is fixed as `sourceUpdatedAt` and is not configurable.

> **Breaking change from v1:** Prior to v2, freshness was tracked via a `sourceHash` string
> (an MD5 hash of translatable field values). Documents stored with `sourceHash` will have their
> translations unconditionally re-fetched on the first `translate()` call after upgrading,
> because the `sourceUpdatedAt` field will be absent.

### Translations

The `translation` attribute contains all the translations of the document.
Each sub-document represents a translation in a specific language, and is stored in an array.

The attribute name is not configurable.

#### Sub-document

The sub-document is a partial document that contains only the translatable fields of the original document.

In addition, the sub-document contains the following meta-information attributes:

* The `language` attribute contains the language of the translation
  (also renamed by the `languageField` option).

* The `sourceUpdatedAt` attribute is the timestamp of the native document at the time the
  translation was last generated. It is compared against the native document's `sourceUpdatedAt`
  to decide whether a re-translation is needed.

* The `autoTranslated` attribute is set to `true` if the translation was automatically fetched
  from the translation provider.

If the native `sourceUpdatedAt` is newer than the translation's `sourceUpdatedAt`, the plugin
will automatically re-fetch the translation from the provider, unless `autoTranslated` is set
to `false`. This allows you to manually manage a locale's translation and prevent the plugin
from overwriting it. If the timestamps differ, it is easy to warn content managers that a custom
translation may need to be revised.


## Instance Methods

### `getSupportedLanguages()` (used internally)

The `getSupportedLanguages` method retrieves the list of all locales available for the document,
including the native language.

### `getExistingTranslationForLocale(locale: string)` (used internally)

The `getExistingTranslationForLocale` method retrieves the translation for a specific locale
available in the `translation` array.

### `updateOrReplaceTranslation(locale: string, translation: object)` (used internally)

The `updateOrReplaceTranslation` method manually manages the translation for a locale, placing
or replacing the translation object in the `translation` array according to the locale.

### `translationSourceMap()` (used internally)

The `translationSourceMap` method retrieves a map of the translatable field paths of the document
with their corresponding values in the native language.

### `getSourceUpdatedAt()` (used internally)

Returns the current value of the `sourceUpdatedAt` field on the document.

### `getTranslation(locale: string)` (used internally)

Retrieves the translation of the document in the specified language, or fetches it from the
translation provider when:
- no translation exists yet, or
- the existing translation has `autoTranslated: true` and the native `sourceUpdatedAt` is newer
  than the translation's `sourceUpdatedAt`.

### `translate(locale: string)`

The `translate` method retrieves the document in a specific language as a plain object.

The output is a plain object containing the complete document with translatable fields translated
into the specified language, plus the following meta-information attributes:
* `nativeLanguage`: The native language of the original document.
* `supportedLanguages`: An array of all existing languages for the document.
* `sourceUpdatedAt`: The timestamp of the source document at the time of the last translation.
* `autoTranslated`: Whether the translation was automatically fetched from the provider.

Examples of various nested cases can be seen in the
[test suite](https://github.com/pjdauvert/mongoose-translation-plugin/tree/main/src/__tests__/plugin.test.ts).
