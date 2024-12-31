import {randomUUID} from "crypto";
import microtime from 'microtime';
import {CreatorID, HostID, PeerAddress, Timestamp, TransactionID} from "./types.js";

export type DeltaID = string;

export type PointerTarget = string | number | undefined;

export type Pointer = {
  localContext: string;
  target: PointerTarget;
  targetContext?: string;
};

export class DeltaNetworkImage {
  id: DeltaID;
  timeCreated: Timestamp;
  host: HostID;
  creator: CreatorID;
  pointers: Pointer[];
  constructor({id, timeCreated, host, creator, pointers}: DeltaNetworkImage) {
    this.id = id;
    this.host = host;
    this.creator = creator;
    this.timeCreated = timeCreated;
    this.pointers = pointers;
  }
};

export class Delta extends DeltaNetworkImage {
  receivedFrom?: PeerAddress;
  timeReceived: Timestamp;
  transactionId?: TransactionID;

  // TODO: Verify the following assumption:
  // We're assuming that you only call this constructor when
  // actually creating a new delta.
  // When receiving one from the network, you can 
  constructor({host, creator, pointers}: Partial<DeltaNetworkImage>) {
    // TODO: Verify that when receiving a delta from the network we can
    //   retain the delta's id.
    const id = randomUUID();
    const timeCreated = microtime.now();
    if (!host || !creator || !pointers) throw new Error('uninitializied values');
    super({id, timeCreated, host, creator, pointers});
    this.timeCreated = timeCreated;
    this.timeReceived = this.timeCreated;
  }
}

export type DeltaFilter = (delta: Delta) => boolean;

