"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  translationPlugin: () => translationPlugin
});
module.exports = __toCommonJS(src_exports);

// src/plugin.ts
var import_mongoose = require("mongoose");

// src/schema.ts
function eachPathRecursive(schema, handler, path = []) {
  schema.eachPath((pathname, schemaType) => {
    path.push(pathname);
    if (schemaType.schema) eachPathRecursive(schemaType.schema, handler, path);
    else handler(path.join("."), schemaType);
    path.pop();
  });
}
function getTranslatablePaths(schema) {
  const pathsToTranslate = [];
  eachPathRecursive(schema, (pathname, schemaType) => {
    if (schemaType.options?.translatable || schemaType.options?.type?.[0]?.translatable) pathsToTranslate.push(pathname);
  });
  return pathsToTranslate;
}
function generateSchemaRecursive(pathnames, tree, translationSchema) {
  const pathName = pathnames.shift();
  const treePath = tree[pathName];
  const isLeaf = !pathnames.length;
  if (Array.isArray(treePath) && treePath[0]) {
    const branch = treePath[0];
    const existingSchema = translationSchema[pathName]?.[0];
    const nestedTranslationSchema = existingSchema || { _id: false };
    if (isLeaf) {
      const { translatable, required, ...options } = branch;
      Object.assign(nestedTranslationSchema, options);
    } else {
      Object.assign(nestedTranslationSchema, generateSchemaRecursive(pathnames, branch.tree || branch, nestedTranslationSchema));
    }
    if (!translationSchema[pathName]) Object.assign(translationSchema, { [pathName]: [nestedTranslationSchema] });
  } else if (!isLeaf) {
    const nestedTranslationSchema = translationSchema[pathName] || {};
    Object.assign(nestedTranslationSchema, generateSchemaRecursive(pathnames, treePath, nestedTranslationSchema));
    if (!translationSchema[pathName]) Object.assign(translationSchema, { [pathName]: nestedTranslationSchema });
  } else {
    const { translatable, required, ...options } = treePath;
    Object.assign(translationSchema, { [pathName]: options });
  }
  return translationSchema;
}
var addSchemaForPath = (schema) => (translationSchema, path) => {
  const pathnames = path.split(".");
  const { tree } = schema;
  return generateSchemaRecursive(pathnames, tree, translationSchema);
};
function buildTranslationSchema(schema, schemaFields, pathsToTranslate) {
  const translationSchema = {
    autoTranslated: { type: Boolean },
    ...schemaFields
  };
  try {
    pathsToTranslate.reduce(addSchemaForPath(schema), translationSchema);
  } catch (error) {
    console.error("The translation schema could not be build recursively:", error);
  }
  return translationSchema;
}

// src/tools.ts
var import_node_crypto = require("crypto");
var import_object_path = __toESM(require("object-path"), 1);
function prefixMapKeys(map, prefix) {
  const result = /* @__PURE__ */ new Map();
  map.forEach((value, key) => result.set(`${prefix}.${key}`, value));
  return result;
}
function notEmpty(value) {
  return Boolean(value);
}
function indexedMap(array, prefix) {
  const mappedArray = array.map((value, index) => {
    const key = [prefix, String(index)].filter(Boolean).join(".");
    if (typeof value !== "string") return null;
    return [key, value];
  }).filter(notEmpty);
  return new Map(mappedArray);
}
function mapEntityPathValues(path, entity) {
  let resultMap = /* @__PURE__ */ new Map();
  if (!entity) return resultMap;
  if (!path?.length) return resultMap;
  const [root, ...subPath] = path;
  const translatableValue = entity[root];
  if (!subPath.length) {
    if (typeof translatableValue === "string") {
      resultMap.set(root, translatableValue);
    } else if (Array.isArray(translatableValue)) {
      resultMap = indexedMap(translatableValue, root);
    } else {
    }
  } else {
    let subMap = /* @__PURE__ */ new Map();
    if (Array.isArray(translatableValue)) {
      translatableValue.forEach((subEntity, index) => {
        const mappedSubEntity = prefixMapKeys(mapEntityPathValues(subPath, subEntity), index.toString());
        mappedSubEntity.forEach((value, key) => subMap.set(key, value));
      });
    } else {
      subMap = mapEntityPathValues(subPath, translatableValue);
    }
    resultMap = prefixMapKeys(subMap, root);
  }
  return resultMap;
}
function generateObjectFromPathMap(objectMap) {
  const resultObject = {};
  objectMap.forEach((value, path) => {
    import_object_path.default.set(resultObject, path, value);
  });
  return resultObject;
}
function applyTranslation(document, translation) {
  if (!translation) return document;
  const localized = Object.assign({}, document);
  Object.keys(translation).forEach((key) => {
    const override = translation[key];
    if (override && typeof override === "string") {
      Object.assign(localized, { [key]: override });
    } else if (Array.isArray(override)) {
      const translatedArray = [];
      localized[key].forEach((arrayItem, index) => {
        const itemTranslation = override[index];
        if (itemTranslation) {
          if (typeof arrayItem === "string") {
            translatedArray[index] = itemTranslation;
          } else if (Array.isArray(arrayItem)) {
            throw new Error("Nested arrays are not managed for applyTranslation, please consider nesting objects instead");
          } else if (typeof arrayItem === "object") {
            translatedArray[index] = applyTranslation(arrayItem, itemTranslation);
          } else translatedArray[index] = arrayItem;
        }
      });
      Object.assign(localized, { [key]: translatedArray });
    } else if (typeof override === "object") {
      const nestedTranslation = applyTranslation(localized[key], override);
      Object.assign(localized, { [key]: nestedTranslation });
    }
  });
  return localized;
}
function hashMapStringValues(aMap) {
  return (0, import_node_crypto.createHash)("md5").update(Array.from(aMap.values()).join("")).digest("base64");
}
async function generateAutoTranslation(from, to, source, translator) {
  const translationsResult = /* @__PURE__ */ new Map();
  try {
    const autoTranslations = await translator({
      from,
      to,
      text: Array.from(source.values())
    });
    Array.from(source.keys()).forEach((key, index) => translationsResult.set(key, autoTranslations[index]));
  } catch (error) {
    console.log(`Translation failed form ${from} to ${to}`);
  }
  return translationsResult;
}
function mapTranslationSource(entity, paths, sanitizer) {
  const translationSourceMap = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const pathSegments = path.split(".");
    const pathValuesMap = mapEntityPathValues(pathSegments, entity);
    pathValuesMap.forEach((value, key) => translationSourceMap.set(key, sanitizer(value)));
  }
  return translationSourceMap;
}

// src/plugin.ts
function translationPlugin(schema, opts) {
  if (typeof opts.translator !== "function") throw new Error("[Options]: translator must be a function: ({ text, from, to }) => [String]");
  const options = {
    translator: opts.translator,
    sanitizer: opts.sanitizer || ((value) => value),
    defaultLanguage: opts.defaultLanguage || "en",
    languageField: opts.languageField || "language",
    hashField: opts.hashField || "sourceHash"
  };
  const pathsToTranslate = getTranslatablePaths(schema);
  const schemaFields = {
    [options.hashField]: { type: String },
    [options.languageField]: { type: String, default: options.defaultLanguage }
  };
  schema.add(schemaFields);
  const translationSchemaDefinition = buildTranslationSchema(schema, schemaFields, pathsToTranslate);
  const translationSchema = new import_mongoose.Schema(translationSchemaDefinition, { _id: false });
  schema.add({ translation: [translationSchema] });
  schema.pre("save", function generateNativeHash() {
    this.set(options.hashField, this.generateSourceHash());
  });
  schema.methods.getSupportedLanguages = function getSupportedLanguages() {
    const supportedLanguages = [this.get(options.languageField)];
    const translation = this.get("translation");
    if (translation && Array.isArray(translation)) {
      for (const tr of translation) {
        supportedLanguages.push(tr[options.languageField]);
      }
    } else throw new Error("Incorrect translation field");
    return supportedLanguages;
  };
  schema.methods.getExistingTranslationForLocale = function getExistingTranslationForLocale(locale) {
    const translation = this.get("translation").find((trad) => trad[options.languageField] === locale);
    return translation?.toObject();
  };
  schema.methods.updateOrReplaceTranslation = async function updateOrReplaceTranslation(translation) {
    const translations = this.get("translation").filter((t) => t[options.languageField] !== translation[options.languageField]);
    translations.push(translation);
    this.set("translation", translations);
    await this.save();
  };
  schema.methods.translationSourceMap = function translationSourceMap() {
    return mapTranslationSource(this.toObject(), pathsToTranslate, options.sanitizer);
  };
  schema.methods.generateSourceHash = function generateSourceHash() {
    const translationSource = this.translationSourceMap();
    return hashMapStringValues(translationSource);
  };
  schema.methods.getTranslation = async function getTranslation(locale) {
    const _this = this;
    const translationSource = _this.translationSourceMap();
    const translationSourceHash = _this.generateSourceHash();
    let translation = _this.getExistingTranslationForLocale(locale);
    if (!translation || translation.autoTranslated && translation[options.hashField] !== translationSourceHash)
      try {
        const nativeLanguage = this.get(options.languageField);
        const translationsMap = await generateAutoTranslation(nativeLanguage, locale, translationSource, options.translator);
        const translationOverrides = generateObjectFromPathMap(translationsMap);
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
  schema.methods.translate = async function translate(locale) {
    const _this = this;
    const nativeLanguage = this.get([options.languageField]);
    let entityTranslation;
    if (nativeLanguage !== locale) {
      entityTranslation = await _this.getTranslation(locale);
    }
    const translationMeta = {
      [options.hashField]: entityTranslation?.[options.hashField] || _this.get(options.hashField),
      [options.languageField]: entityTranslation?.[options.languageField] || nativeLanguage,
      autoTranslated: entityTranslation?.autoTranslated || false
    };
    const { translation, _id, __v, ...entityToTranslate } = _this.toObject();
    const appliedTranslation = applyTranslation(entityToTranslate, entityTranslation);
    const translatedMeta = {
      supportedLanguages: _this.getSupportedLanguages(),
      nativeLanguage
    };
    return Object.assign(appliedTranslation, translatedMeta, translationMeta);
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  translationPlugin
});
//# sourceMappingURL=index.cjs.map