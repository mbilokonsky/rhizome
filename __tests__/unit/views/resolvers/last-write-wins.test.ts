import Debug from "debug";
import { createDelta } from '@src/core/delta-builder';
import { Lossless, RhizomeNode } from '@src';
import { TimestampResolver } from '@src/views/resolvers/timestamp-resolvers';
const debug = Debug('rz:test:last-write-wins');

// This was initially written to test a LastWriteWins resolver, but that has been
// superceded by the TimestampResolver.

describe('Last write wins', () => {

  describe('given that two separate writes occur', () => {
    const node = new RhizomeNode();
    const lossless = new Lossless(node);

    const lossy = new TimestampResolver(lossless);

    beforeAll(() => {
      lossless.ingestDelta(createDelta('a', 'h')
        .setProperty('broccoli', 'want', 95, 'vegetable')
        .buildV1()
      );

      lossless.ingestDelta(createDelta('a', 'h')
        .setProperty('broccoli', 'want', 90, 'vegetable')
        .buildV1()
      );
    });

    test('our resolver should return the most recently written value', () => {
      const result = lossy.resolve(["broccoli"]);
      debug('result', result);
      expect(result).toMatchObject({
        broccoli: {
          id: "broccoli",
          properties: {
            want: 90
          }
        }
      });
    });
  });
});
