import Debug from "debug";
import {Delta} from "../src/delta";
import {LastWriteWins} from "../src/last-write-wins";
import {Lossless} from "../src/lossless";
import {RhizomeNode} from "../src/node";
const debug = Debug('test:last-write-wins');

describe('Last write wins', () => {

  describe('given that two separate writes occur', () => {
    const node = new RhizomeNode();
    const lossless = new Lossless(node);

    const lossy = new LastWriteWins(lossless);

    beforeAll(() => {
      lossless.ingestDelta(new Delta({
        creator: 'a',
        host: 'h',
        pointers: [{
          localContext: "vegetable",
          target: "broccoli",
          targetContext: "want"
        }, {
          localContext: "desire",
          target: 95,
        }]
      }));

      lossless.ingestDelta(new Delta({
        creator: 'a',
        host: 'h',
        pointers: [{
          localContext: "vegetable",
          target: "broccoli",
          targetContext: "want"
        }, {
          localContext: "want",
          target: 90,
        }]
      }));
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
