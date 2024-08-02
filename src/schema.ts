import type { Schema, SchemaDefinition, SchemaDefinitionProperty, SchemaType } from 'mongoose';

import type { Tree } from './tools';

declare module 'mongoose' {
  interface Schema {
    tree?: unknown; //nested object that can be an array or a property
  }
}

function eachPathRecursive(schema: Schema, handler: (s: string, t: SchemaType) => void, path: string[] = []): void {
  schema.eachPath((pathname, schemaType) => {
    path.push(pathname);
    if (schemaType.schema) eachPathRecursive(schemaType.schema, handler, path);
    else handler(path.join('.'), schemaType);
    path.pop();
  });
}

/**
 * This function returns the list of entity's translatable paths as Strings.
 * If a property has option 'translatable' set to 'true' in the Schema, it will be
 * searched recursively in the object tree. Refer to mongoose implementation for
 * Schema instance scanning.
 * ex:
 * {
 *   aProp: {
 *     anArray: [
 *       {
 *         aKey: { type: String, translatable: true }
 *       }
 *     ]
 *   },
 *   aTranslatableProp: { type: String, translatable: true },
 *   anotherProp: String
 * }
 * will return ['aTranslatableProp', 'aProp.anArray.aKey']
 * @param schema
 * @returns {[String]}
 */
export function getTranslatablePaths(schema: Schema): string[] {
  const pathsToTranslate: string[] = [];
  eachPathRecursive(schema, (pathname: string, schemaType: SchemaType) => {
    if (schemaType.options?.translatable || schemaType.options?.type?.[0]?.translatable) pathsToTranslate.push(pathname);
  });
  return pathsToTranslate;
}

function generateSchemaRecursive(pathnames: string[], tree: Tree, translationSchema: SchemaDefinition): SchemaDefinition {
  const pathName = pathnames.shift() as string;

  const treePath = tree[pathName];
  const isLeaf = !pathnames.length;

  // current path is an array in the model
  if (Array.isArray(treePath) && treePath[0]) {
    const branch = treePath[0] as Tree;

    // get existing schema or initiate it.
    const existingSchema = (translationSchema[pathName] as SchemaDefinitionProperty[])?.[0];
    const nestedTranslationSchema = existingSchema || { _id: false };
    if (isLeaf) {
      // the array encloses simple values
      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
      const { translatable, required, ...options } = branch;
      Object.assign(nestedTranslationSchema, options);
    } else {
      // the array encloses nested elements
      Object.assign(nestedTranslationSchema, generateSchemaRecursive(pathnames, (branch.tree as Tree) || branch, nestedTranslationSchema as SchemaDefinition));
    }
    if (!translationSchema[pathName]) Object.assign(translationSchema, { [pathName]: [nestedTranslationSchema] });
  }
  // current path is a nested object
  else if (!isLeaf) {
    // assign property and process deeper
    const nestedTranslationSchema = translationSchema[pathName] || {};
    Object.assign(nestedTranslationSchema, generateSchemaRecursive(pathnames, treePath as Tree, nestedTranslationSchema as SchemaDefinition));
    if (!translationSchema[pathName]) Object.assign(translationSchema, { [pathName]: nestedTranslationSchema });
  }
  // current path is a translatable value
  else {
    // add all schema options to this path except required and translatable
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const { translatable, required, ...options } = treePath as Tree;
    Object.assign(translationSchema, { [pathName]: options });
  }
  return translationSchema;
}

const addSchemaForPath =
  (schema: Schema) =>
  (translationSchema: SchemaDefinition, path: string): SchemaDefinition => {
    const pathnames = path.split('.');
    const { tree } = schema;
    return generateSchemaRecursive(pathnames, tree as Tree, translationSchema);
  };

/**
 * This function will generate a mongoose 'translation' sub-Schema based on
 * the list of paths, going recursively in the original Schema to determine
 * whether the property is a String an Array or an Object.
 * In the end, the sub-schema created reflects the original schema, filtered
 * by properties marked 'translatable' in their options.
 * The final translation schema which will hold all translated values also has
 * the following properties:
 * 'autoTranslated', Boolean: indicates whether the actual translation is generated automatically by external provider
 * 'sourceHash', String: is the hash of the original content to compare updates in the original content and trigger
 * another automatic translation when changed.
 * 'language' (by default), holds the locale of the contents stored in the translation instance.
 * @param schema
 * @param schemaFields
 * @param pathsToTranslate
 * @returns {Schema}
 */
export function buildTranslationSchema(schema: Schema, schemaFields: SchemaDefinition, pathsToTranslate: string[]): SchemaDefinition {
  const translationSchema: SchemaDefinition = {
    autoTranslated: { type: Boolean },
    ...schemaFields
  };
  try {
    pathsToTranslate.reduce(addSchemaForPath(schema), translationSchema);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('The translation schema could not be build recursively:', error);
  }
  return translationSchema; // recursive sub-schema definition
}
