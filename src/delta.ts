import microtime from 'microtime';
import {randomUUID} from "crypto";
import {PeerAddress, Timestamp} from "./types";

export type DeltaID = string;

export type PointerTarget = string | number | undefined;

export type Pointer = {
  localContext: string;
  target: PointerTarget;
  targetContext?: string;
};

export class Delta {
  id: DeltaID;
  receivedFrom?: PeerAddress;
  timeReceived: Timestamp;
  timeCreated: Timestamp;
  creator: string;
  host: string;
  pointers: Pointer[] = [];
  constructor(delta: Omit<Delta, "id" | "timeReceived" | "timeCreated">) {
    this.id = randomUUID();
    this.timeCreated = microtime.now();
    this.timeReceived = this.timeCreated;
    this.creator = delta.creator;
    this.host = delta.host;
    this.receivedFrom = delta.receivedFrom;
    this.pointers = delta.pointers;
  }
}

export type DeltaFilter = (delta: Delta) => boolean;

