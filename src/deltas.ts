import Debug from 'debug';
import EventEmitter from 'node:events';
import objectHash from 'object-hash';
import {Delta, DeltaNetworkImage} from './delta';
import {RhizomeNode} from './node';
const debug = Debug('rz:deltas');

enum Decision {
  Accept,
  Reject,
  Defer
};

export class DeltaStream {
  rhizomeNode: RhizomeNode;
  deltaStream = new EventEmitter();
  deltasProposed: Delta[] = [];
  deltasAccepted: Delta[] = [];
  deltasRejected: Delta[] = [];
  deltasDeferred: Delta[] = [];
  hashesReceived = new Set<string>();

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
  }

  applyPolicy(delta: Delta): Decision {
    return !!delta && Decision.Accept;
  }

  receiveDelta(delta: Delta) {
    // Deduplication: if we already received this delta, disregard it
    const hash = objectHash(delta);
    if (!this.hashesReceived.has(hash)) {
      this.hashesReceived.add(hash);
      this.deltasProposed.push(delta);
    }
  }

  ingestDelta(delta: Delta) {
    const decision = this.applyPolicy(delta);
    switch (decision) {
      case Decision.Accept:
        this.deltasAccepted.push(delta);
        this.deltaStream.emit('delta', delta);
        break;
      case Decision.Reject:
        this.deltasRejected.push(delta);
        break;
      case Decision.Defer:
        this.deltasDeferred.push(delta);
        break;
    }
  }

  ingestNext(): boolean {
    const delta = this.deltasProposed.shift();
    if (!delta) {
      return false;
    }
    this.ingestDelta(delta);
    return true;
  }

  ingestAll() {
    while (this.ingestNext());
  }

  ingestNextDeferred(): boolean {
    const delta = this.deltasDeferred.shift();
    if (!delta) {
      return false;
    }
    this.ingestDelta(delta);
    return true;
  }

  ingestAllDeferred() {
    while (this.ingestNextDeferred());
  }

  subscribeDeltas(fn: (delta: Delta) => void) {
    this.deltaStream.on('delta', (delta) => {
      fn(delta);
    });
  }

  async publishDelta(delta: Delta) {
    debug(`[${this.rhizomeNode.config.peerId}]`, `Publishing delta: ${JSON.stringify(delta)}`);
    await this.rhizomeNode.pubSub.publish(
      "deltas",
      this.serializeDelta(delta)
    );
  }

  serializeDelta(delta: Delta): string {
    const deltaNetworkImage = new DeltaNetworkImage(delta);
    return JSON.stringify(deltaNetworkImage);
  }

  deserializeDelta(input: string): Delta {
    // TODO: Input validation
    return JSON.parse(input);
  }
}
