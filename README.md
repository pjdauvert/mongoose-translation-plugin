# Mongoose Translation Plugin

This translation plugin is designed for [Mongoose](https://mongoosejs.com) together with a
translation provider such as [Google Translate](https://cloud.google.com/translate) or [DeepL](https://www.deepl.com/translator).

It is a simple plugin that allows you to translate your Mongoose models by simply adding `translatable` to any attribute
of a mongoose Schema and store overrides making contents searchable in any translated language.

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

## How it works
The plugin will automatically create a new attribute `translation` for the translations and will handle the translation
of the attributes of the schema that have been flagged.

The translations are stored within each document in the `translation` attribute.

If a translation is not found for a given locale, the plugin allows you to retrieve the translation from the original document to that locale by requesting a translation provider

The translations provided can be overridden by the user.

The original document's translatable fields are hashed, in order to re-fetch the translation from the original document if any change occur.

## Installation 



### Setup

### Options

### Examples



## Contribute

Please respect the [Code of Conduct](CODE_OF_CONDUCT.md) to submit your improvement change requests. 

## License

[![AGPLv3](https://www.gnu.org/graphics/agplv3-with-text-162x68.png)](LICENSE.md)

Mongoose Translation Plugin is licensed under the [AGPL license](LICENSE.md).