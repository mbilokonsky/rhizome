import { add_operation, apply } from 'json-logic-js';
import { Delta } from '../delta.js';

type DeltaContext = Delta & {
  creatorAddress: string;
};

add_operation('in', (needle, haystack) => {
  return [...haystack].includes(needle);
});

export function applyFilter(deltas: Delta[], filterExpr: JSON): Delta[] {
  return deltas.filter(delta => {
    const context: DeltaContext = {
      ...delta,
      creatorAddress: [delta.creator, delta.host].join('@'),
    };
    return apply(filterExpr, context);
  });
}
