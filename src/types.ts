export type JSONLogic = object;

export type FilterExpr = JSONLogic;

export type FilterGenerator = () => FilterExpr;

export type PropertyTypes = string | number | undefined;

export type DomainEntityID = string;
export type PropertyID = string;

export type Properties = {[key: PropertyID]: PropertyTypes};

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
    return `${this.addr}:${this.port}`;
  }

  toJSON() {
    return this.toAddrString();
  }

  isEqual(other: PeerAddress) {
    return this.addr === other.addr && this.port === other.port;
  }
};

