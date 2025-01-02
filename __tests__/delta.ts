import {DeltaV1, DeltaV2} from "../src/delta";

describe("Delta", () => {
  it("can convert DeltaV1 to DeltaV2", () => {
    const deltaV1 = new DeltaV1({
      creator: 'a',
      host: 'h',
      pointers: [{
        localContext: 'color',
        target: 'red'
      }, {
        localContext: 'furniture',
        target: 'chair-1',
        targetContext: 'color'
      }]
    });

    const deltaV2 = DeltaV2.fromV1(deltaV1);

    expect(deltaV2).toMatchObject({
      ...deltaV1,
      pointers: {
        color: 'red',
        furniture: {'chair-1': 'color'}
      }
    });
  });

  it("can convert DeltaV2 to DeltaV1", () => {
    const deltaV2 = new DeltaV2({
      creator: 'a',
      host: 'h',
      pointers: {
        color: 'red',
        furniture: {'chair-1': 'color'}
      }
    });

    const deltaV1 = deltaV2.toV1();

    expect(deltaV1).toMatchObject({
      ...deltaV2,
      pointers: [{
        localContext: 'color',
        target: 'red'
      }, {
        localContext: 'furniture',
        target: 'chair-1',
        targetContext: 'color'
      }]
    });
  });
});
