import { Query, QueryResult, } from './types';
import { deltasAccepted } from './deltas';
import { applyFilter } from './filter';

// export const queryResultMemo = new Map<Query, QueryResult>();

export function issueQuery(query: Query): QueryResult {
  const deltas = applyFilter(deltasAccepted, query.filterExpr);
  return {
    deltas
    // TODO: Materialized view / state collapse snapshot
  };
}


