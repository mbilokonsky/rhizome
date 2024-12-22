export type Pointer = {
  localContext: string,
  target: string | number | undefined,
  targetContext?: string
};

export type Delta =   {
  creator: string,
  host: string,
  pointers: Pointer[],
}

export type DeltaContext = Delta & {
  creatorAddress: string;
};

export type Query = {
    filterExpr: JSON
};

export type QueryResult = {
    deltas: Delta[]
};

export enum Decision {
    Accept,
    Reject,
    Defer
};


export type JSONLogic = object;

export type FilterExpr = JSONLogic;

export type FilterGenerator = () => FilterExpr;

export type PropertyTypes = string | number | undefined;

