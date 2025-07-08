import { createDelta } from '@src/core/delta-builder';
import {DeltaV2} from "../../../../src";

describe("Delta", () => {
  test("can convert DeltaV1 to DeltaV2", () => {
    const deltaV1 = createDelta('a', 'h')
      .addPointer('color', 'red')
      .addPointer('furniture', 'chair-1', 'color')
      .buildV1();

    const deltaV2 = DeltaV2.fromV1(deltaV1);

    expect(deltaV2).toMatchObject({
      ...deltaV1,
      pointers: {
        color: 'red',
        furniture: {'chair-1': 'color'}
      }
    });
  });

  test("can convert DeltaV2 to DeltaV1", () => {
    const deltaV2 = createDelta('a', 'h')
      .addPointer('color', 'red')
      .addPointer('furniture', 'chair-1', 'color')
      .buildV2();

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
