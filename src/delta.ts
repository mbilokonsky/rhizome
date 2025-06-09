import {randomUUID} from "crypto";
import Debug from 'debug';
import microtime from 'microtime';
import {PeerAddress} from "./peers";
import {CreatorID, DomainEntityID, HostID, PropertyID, Timestamp, TransactionID} from "./types";
import {validateDeltaNetworkImageV1, validateDeltaNetworkImageV2} from "./delta-validation";
const debug = Debug('rz:delta');

export type DeltaID = string;

export type PointerTarget = string | number | null;

type PointerV1 = {
  localContext: string;
  target: PointerTarget;
  targetContext?: string;
};

export type Scalar = string | number | null;
export type Reference = {
  [key: DomainEntityID]: PropertyID
};

export type PointersV2 = {
  [key: PropertyID]: Scalar | Reference
};

export class DeltaNetworkImageV1 {
  id: DeltaID;
  timeCreated: Timestamp;
  host: HostID;
  creator: CreatorID;
  pointers: PointerV1[];

  constructor({id, timeCreated, host, creator, pointers}: DeltaNetworkImageV1) {
    this.id = id;
    this.host = host;
    this.creator = creator;
    this.timeCreated = timeCreated;
    this.pointers = pointers;
  }
};

export class DeltaNetworkImageV2 {
  id: DeltaID;
  timeCreated: Timestamp;
  host: HostID;
  creator: CreatorID;
  pointers: PointersV2;

  constructor({id, timeCreated, host, creator, pointers}: DeltaNetworkImageV2) {
    this.id = id;
    this.host = host;
    this.creator = creator;
    this.timeCreated = timeCreated;
    this.pointers = pointers;
  }
};

export class DeltaV1 extends DeltaNetworkImageV1 {
  receivedFrom?: PeerAddress;
  timeReceived: Timestamp;
  transactionId?: TransactionID;

  constructor({id, timeCreated, host, creator, pointers}: Partial<DeltaNetworkImageV1>) {
    id = id ?? randomUUID();
    timeCreated = timeCreated ?? microtime.now();
    if (!host || !creator || !pointers) throw new Error('uninitializied values');
    super({id, timeCreated, host, creator, pointers});
    this.timeCreated = timeCreated;
    this.timeReceived = this.timeCreated;
  }

  toNetworkImage() {
    return new DeltaNetworkImageV1(this);
  }

  static fromNetworkImage(delta: DeltaNetworkImageV1) {
    validateDeltaNetworkImageV1(delta);
    return new DeltaV1(delta);
  }
}

export class DeltaV2 extends DeltaNetworkImageV2 {
  receivedFrom?: PeerAddress;
  timeReceived: Timestamp;
  transactionId?: TransactionID;

  constructor({id, timeCreated, host, creator, pointers}: Partial<DeltaNetworkImageV2>) {
    id = id ?? randomUUID();
    timeCreated = timeCreated ?? microtime.now();
    if (!host || !creator || !pointers) throw new Error('uninitializied values');
    super({id, timeCreated, host, creator, pointers});
    this.timeCreated = timeCreated;
    this.timeReceived = this.timeCreated;
  }

  toNetworkImage() {
    return new DeltaNetworkImageV2(this);
  }

  static fromNetworkImage(delta: DeltaNetworkImageV2) {
    validateDeltaNetworkImageV2(delta);
    return new DeltaV2(delta);
  }

  static fromV1(delta: DeltaV1) {
    const pointersV2: PointersV2 = {};
    for (const {localContext, target, targetContext} of delta.pointers) {
      if (targetContext && typeof target === "string") {
        pointersV2[localContext] = {[target]: targetContext};
      } else {
        pointersV2[localContext] = target;
      }
    }

    debug(`fromV1, pointers in: ${JSON.stringify(delta.pointers)}`);
    debug(`fromV1, pointers out: ${JSON.stringify(pointersV2)}`);
    return DeltaV2.fromNetworkImage({
      ...delta,
      pointers: pointersV2
    });
  }

  toV1() {
    const pointersV1: PointerV1[] = [];
    for (const [localContext, pointerTarget] of Object.entries(this.pointers)) {
      if (pointerTarget && typeof pointerTarget === "object") {
        const [obj] = Object.entries(pointerTarget)
        if (!obj) throw new Error("invalid pointer target");
        const [target, targetContext] = Object.entries(pointerTarget)[0];
        pointersV1.push({localContext, target, targetContext});
      } else {
        pointersV1.push({localContext, target: pointerTarget});
      }
    }
    return new DeltaV1({
      ...this,
      pointers: pointersV1
    });
  }
}

// Alias
export class Delta extends DeltaV1 {}

export type DeltaFilter = (delta: Delta) => boolean;

