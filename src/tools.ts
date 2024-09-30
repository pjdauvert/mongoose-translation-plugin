import { createHash } from 'node:crypto';
import objectPath from 'object-path';

import type { SanitizerFunction, TranslatorFunction } from './mongoose.types';

function prefixMapKeys(map: Map<string, string>, prefix: string): Map<string, string> {
  const result = new Map();
  map.forEach((value, key) => result.set(`${prefix}.${key}`, value));
  return result;
}

/**
 * Prints a map in a human-readable format
 * This is useful for debugging purposes
 * @param {Map} aMap
 * @returns {string}
 */
export function printMap(aMap: Map<string, string>): string {
  let message = '\nMap: [\n';
  aMap.forEach((val, key) => {
    message += `\t[${key}: ${val}]\n`;
  });
  message += ']\n';
  return message;
}

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return Boolean(value);
}

function indexedMap(array: Array<unknown>, prefix: string): Map<string, string> {
  const mappedArray = array
    .map((value, index) => {
      const key = [prefix, String(index)].filter(Boolean).join('.');
      if (typeof value !== 'string') return null; // non string objects are skipped
      return [key, value] as [string, string];
    })
    .filter(notEmpty);

  return new Map(mappedArray);
}

/**
 * From a plain object and a path, will return a map of key/values where the key represents the unique identifiable
 * path of the value and the actual value. If the path lead to an array, then each path will include the index in the
 * array. ex:
 * - path = ['profile', 'workingLanguage', 'name']
 * - entity = { profile: { workingLanguage: [ { name: 'french' }, { name: 'english' } ] } }
 * yields the map :
 * [
 *   ['profile.workingLanguage.1.name', 'french'],
 *   ['profile.workingLanguage.2.name', 'english']
 * ]
 *
 * @param {[String]} [path] path to the requested value in the entity
 * @param {Object} [entity] a plain object within which the value is searched
 */
export type Tree = {
  [key: string]: Array<Tree | string> | string | undefined | null | Tree;
};

export function mapEntityPathValues(path: string[], entity: Tree): Map<string, string> {
  let resultMap = new Map();

  // no-op cases
  if (!entity) return resultMap; //entity to parse cannot be null or undefined
  if (!path?.length) return resultMap; //path cannot be empty array or null

  const [root, ...subPath] = path;

  const translatableValue = entity[root as string];

  // leaf process, the element to translate is directly accessible onto the entity
  if (!subPath.length) {
    if (typeof translatableValue === 'string') {
      resultMap.set(root, translatableValue);
    } else if (Array.isArray(translatableValue)) {
      resultMap = indexedMap(translatableValue, root as string);
    } else {
      // no-op
      //return empty map if value is something else
    }
  } else {
    // recursive process, step into the subpath
    let subMap = new Map<string, string>();
    if (Array.isArray(translatableValue)) {
      translatableValue.forEach((subEntity, index) => {
        const mappedSubEntity = prefixMapKeys(mapEntityPathValues(subPath, <Tree>subEntity), index.toString());
        // copy values in the resulting supMap (flatten)
        mappedSubEntity.forEach((value, key) => subMap.set(key, value));
      });
    } else {
      subMap = mapEntityPathValues(subPath, <Tree>translatableValue);
    }
    resultMap = prefixMapKeys(subMap, root as string);
  }
  return resultMap;
}

export function generateObjectFromPathMap<T>(objectMap: Map<string, string>): T {
  const resultObject = {};
  objectMap.forEach((value, path) => {
    objectPath.set(resultObject, path, value);
  });
  return resultObject as T;
}

/**
 * Recursively overrides an object's properties with its translations.
 * @param document a plain object
 * @param translation a plain object containing overrides
 * @returns the translated object
 */
export function applyTranslation<D extends Tree>(document: D, translation?: Partial<D>): D {
  if (!translation) return document;

  const localized: D = Object.assign({}, document);

  // biome-ignore lint/complexity/noForEach: <explanation>
  Object.keys(translation).forEach((key) => {
    const override = translation[key];
    if (override && typeof override === 'string') {
      // if simple string, just replace with translation.
      // empty values are skipped
      Object.assign(localized, { [key]: override });
    } else if (Array.isArray(override)) {
      // for arrays, each translation shall be mapped to the original item by its index
      // resulting array
      type ArrayItem = string | Tree;
      const translatedArray: ArrayItem[] = [];
      // go through all items of the array

      (localized[key] as ArrayItem[]).forEach((arrayItem: ArrayItem, index: number) => {
        const itemTranslation = override[index];
        // skip empty values
        if (itemTranslation) {
          if (typeof arrayItem === 'string') {
            // place translation value, respecting index
            translatedArray[index] = itemTranslation;
          } else if (Array.isArray(arrayItem)) {
            throw new Error('Nested arrays are not managed for applyTranslation, please consider nesting objects instead');
          } else if (typeof arrayItem === 'object') {
            // retrieve the translation of the nested object
            translatedArray[index] = applyTranslation(arrayItem, itemTranslation as Tree);
          }
          // put any non-translated element in the array
          else translatedArray[index] = arrayItem;
        }
      });
      Object.assign(localized, { [key]: translatedArray });
    } else if (typeof override === 'object') {
      // for nested objects, step in
      const nestedTranslation = applyTranslation(localized[key] as Tree, override as Tree);
      Object.assign(localized, { [key]: nestedTranslation });
    }
  });

  return localized;
}

/**
 * Takes all String values of a map<String, String>, concatenates them and generate a checksum.
 * @param {Map} aMap
 * @returns {string}
 */
export function hashMapStringValues(aMap: Map<string, string>): string {
  return createHash('md5').update(Array.from(aMap.values()).join('')).digest('base64');
}

/**
 * Generates an object which given a source map, key being an object path, and value being the text to translate
 * sends
 * @param {String} from
 * @param {String} to
 * @param {String} source
 * @param {Function} translator
 * @returns {Promise<Map>}
 */
export async function generateAutoTranslation(
  from: string,
  to: string,
  source: Map<string, string>,
  translator: TranslatorFunction
): Promise<Map<string, string>> {
  const translationsResult = new Map();
  try {
    // Get translations from provider
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

/**
 * Generates a mapped list of values to send to the translation service
 * @returns {Map}
 */
export function mapTranslationSource(entity: Tree, paths: string[], sanitizer: SanitizerFunction): Map<string, string> {
  const translationSourceMap = new Map();
  for (const path of paths) {
    const pathSegments = path.split('.');
    const pathValuesMap = mapEntityPathValues(pathSegments, entity);
    pathValuesMap.forEach((value, key) => translationSourceMap.set(key, sanitizer(value)));
  }
  return translationSourceMap;
}
