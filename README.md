# Mongoose Translation Plugin

This plugin is a translation plugin for Mongoose. It is designed to be used with the Mongoose.
It is a simple plugin that allows you to translate your Mongoose models by simply adding `translatable` to any attribute of a mongoose Schema.

The plugin will automatically create a new collection for the translations and will handle the translation of the attributes.

The translations are stored within each document in the `translation` collection.

If a translation is not found for a given locale, the plugin allows you to retrieve the translation from the original document to that locale by requesting a translation provider

The translations provided can be overridden by the user.

The original document's translatable fields are hashed, in order to re-fetch the translation from the original document if any change occur.