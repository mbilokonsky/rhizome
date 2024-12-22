export type Pointer = {
  localContext: string,
  target: string | number | undefined,
  targetContext?: string
};

export type Delta = {
  creator: string,
  host: string,
  pointers: Pointer[],
  receivedFrom?: PeerAddress,
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

export class PeerAddress {
  addr: string;
  port: number;
  constructor(addr: string, port: number) {
    this.addr = addr;
    this.port = port;
  }
  static fromString(addrString: string): PeerAddress {
    const [addr, port] = addrString.trim().split(':');
    return new PeerAddress(addr, parseInt(port));
  }
  toAddrString() {
    console.log('toAddrStr...', {addr: this.addr, port: this.port});
    return `${this.addr}:${this.port}`;
  }
  toJSON() {
    console.log('toAddrStr...', {addr: this.addr, port: this.port});
    return `${this.addr}:${this.port}`;
  }
};

