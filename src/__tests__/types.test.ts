// Helper types
type Expect<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

import type { TranslatableDocument } from '../mongoose.types';

describe('translatable document', () => {
  it('should be able to extend a document', () => {
    type MyObject = {
      createdAt: Date;
      count: number;
    };

    interface MyObjectTranslatable extends TranslatableDocument<MyObject> {
      hello: 'world';
    }

    const obj = {} as MyObjectTranslatable;

    // biome-ignore lint/correctness/noUnusedVariables: type-level assertions
    type testInitialProp = Expect<(typeof obj)['count'] extends number ? true : false>;
    // biome-ignore lint/correctness/noUnusedVariables: type-level assertions
    type helloIsWorld = Expect<Equal<MyObjectTranslatable['hello'], 'world'>>;
    // biome-ignore lint/correctness/noUnusedVariables: type-level assertions
    type countIsNumber = Expect<Equal<MyObjectTranslatable['count'], number>>;

    expect(true).toBeTruthy();
  });
});
