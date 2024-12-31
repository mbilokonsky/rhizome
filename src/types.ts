export type JSONLogic = object;

export type FilterExpr = JSONLogic;

export type FilterGenerator = () => FilterExpr;

export type PropertyTypes = string | number | undefined;

export type DomainEntityID = string;
export type PropertyID = string;
export type TransactionID = string;
export type HostID = string;
export type CreatorID = string;

export type Timestamp = number;

export type ViewMany<T> = {
  [key: DomainEntityID]: T;
};

