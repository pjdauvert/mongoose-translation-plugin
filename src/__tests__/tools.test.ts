/**
 * To run this test suite independently:
 * npx cross-env NODE_ENV=test ava server/services/translation/mongoose-translation-plugin/__test__/tools.spec.js
 */
import { generateObjectFromPathMap, hashMapStringValues, mapEntityPathValues } from '../tools';

describe('Mongoose tanslation plugin tools test', () => {
  test('Entity path flattening - simple', () => {
    const plainObject = { a: 'test' };
    const path = ['a'];

    expect(mapEntityPathValues(path, plainObject).get('a')).toBe('test');
  });

  test('Entity path flattening: array', () => {
    const plainObject = { a: ['A', 'B', 'C'] };
    const path = ['a'];

    const resultMap = mapEntityPathValues(path, plainObject);
    expect(resultMap.get('a.0')).toBe('A');
    expect(resultMap.get('a.1')).toBe('B');
    expect(resultMap.get('a.2')).toBe('C');
  });

  test('Entity path flattening - skipped values', () => {
    const plainObject = { a: null, b: undefined, c: {}, d: [] };

    expect(mapEntityPathValues(['a'], plainObject).size).toBe(0);
    expect(mapEntityPathValues(['b'], plainObject).size).toBe(0);
    expect(mapEntityPathValues(['c'], plainObject).size).toBe(0);
    expect(mapEntityPathValues(['d'], plainObject).size).toBe(0);
  });

  test('Entity path flattening - array of nested objects', () => {
    const plainObject = { a: [{ key: 'A' }, { key: 'B' }, { key: 'C' }] };
    const path = ['a', 'key'];

    const resultMap = mapEntityPathValues(path, plainObject);
    expect(resultMap.get('a.0.key')).toBe('A');
    expect(resultMap.get('a.1.key')).toBe('B');
    expect(resultMap.get('a.2.key')).toBe('C');
  });

  test('Entity path flattening - array of nested objects containing arrays', () => {
    const plainObject = { a: [{ key: ['A', 'B'] }, { key: ['C', 'D'] }, { key: ['E'] }] };
    const path = ['a', 'key'];

    const resultMap = mapEntityPathValues(path, plainObject);
    expect(resultMap.get('a.0.key.0')).toBe('A');
    expect(resultMap.get('a.0.key.1')).toBe('B');
    expect(resultMap.get('a.1.key.0')).toBe('C');
    expect(resultMap.get('a.1.key.1')).toBe('D');
    expect(resultMap.get('a.2.key.0')).toBe('E');
  });

  test('Entity path flattening - deep nesting of objects', () => {
    const plainObject = {
      lvl1: {
        lvl2: [
          { lvl3: [{ lvl4: 'test1' }, { lvl4: 'test2' }] },
          { lvl3: [{ lvl4: 'test3' }] },
          { lvl3: [{ lvl4: ['test4'] }] },
          {
            // no lvl3 on this object
            lvl3_: {}
          },
          {
            // no lvl3 is not an array
            lvl3: { lvl4: 'test5' }
          }
        ]
      }
    };

    const resultMap = mapEntityPathValues('lvl1.lvl2.lvl3.lvl4'.split('.'), plainObject);
    expect(resultMap.size).toBe(5);
    expect(resultMap.get('lvl1.lvl2.0.lvl3.0.lvl4')).toBe('test1');
    expect(resultMap.get('lvl1.lvl2.0.lvl3.1.lvl4')).toBe('test2');
    expect(resultMap.get('lvl1.lvl2.1.lvl3.0.lvl4')).toBe('test3');
    expect(resultMap.get('lvl1.lvl2.2.lvl3.0.lvl4.0')).toBe('test4');
    expect(resultMap.get('lvl1.lvl2.4.lvl3.lvl4')).toBe('test5');
  });

  test('Entity path to object', () => {
    const map = new Map([
      ['a', 'test1'],
      ['b.0', 'test2'],
      ['b.1', 'test3'],
      ['c.d.0.e.2', 'test4'],
      ['c.d.0.e.4', 'test5'],
      ['c.d.0.e.0', 'test6']
    ]);
    const newObject = generateObjectFromPathMap(map);

    const expectedDeepObject = {
      a: 'test1',
      b: ['test2', 'test3'],
      c: {
        d: [{ e: ['test6', undefined, 'test4', undefined, 'test5'] }]
      }
    };
    expect(newObject).toMatchObject(expectedDeepObject);
  });

  test('Map values Hashing', () => {
    const map = new Map([
      ['a', 'test1'],
      ['b', 'test2'],
      ['c', 'test3'],
      ['d', 'test4'],
      ['e', 'test5'],
      ['f', 'test6']
    ]);

    const hash = hashMapStringValues(map);
    expect(hash).toBe('XnppiwhB38qfYLty2bgnvQ==');
  });
});
