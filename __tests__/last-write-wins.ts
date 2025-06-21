import Debug from "debug";
import { createDelta } from '../src/core/delta-builder';
import {Delta, LastWriteWins, Lossless, RhizomeNode} from "../src";
const debug = Debug('test:last-write-wins');

describe('Last write wins', () => {

  describe('given that two separate writes occur', () => {
    const node = new RhizomeNode();
    const lossless = new Lossless(node);

    const lossy = new LastWriteWins(lossless);

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

    it('our resolver should return the most recently written value', () => {
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
