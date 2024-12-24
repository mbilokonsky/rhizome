import EventEmitter from 'node:events';
import objectHash from 'object-hash';
import {myRequestAddr} from './peers';
import {publishSock, subscribeSock} from './pub-sub';
import {Decision, Delta, PeerAddress} from './types';
import Debug from 'debug';
const debug = Debug('deltas');

export const deltaStream = new EventEmitter();

export const deltasProposed: Delta[] = [];
export const deltasAccepted: Delta[] = [];
export const deltasRejected: Delta[] = [];
export const deltasDeferred: Delta[] = [];

export const hashesReceived = new Set<string>();

export function applyPolicy(delta: Delta): Decision {
  return !!delta && Decision.Accept;
}

export function receiveDelta(delta: Delta) {
  // Deduplication: if we already received this delta, disregard it
  const hash = objectHash(delta);
  if (!hashesReceived.has(hash)) {
    hashesReceived.add(hash);
    deltasProposed.push(delta);
  }
}

export function ingestDelta(delta: Delta) {
  const decision = applyPolicy(delta);
  switch (decision) {
    case Decision.Accept:
      deltasAccepted.push(delta);
      deltaStream.emit('delta', {delta});
      break;
    case Decision.Reject:
      deltasRejected.push(delta);
      break;
    case Decision.Defer:
      deltasDeferred.push(delta);
      break;
  }
}

export function ingestNext(): boolean {
  const delta = deltasProposed.shift();
  if (!delta) {
    return false;
  }
  ingestDelta(delta);
  return true;
}

export function ingestAll() {
  while (ingestNext());
}

export function ingestNextDeferred(): boolean {
  const delta = deltasDeferred.shift();
  if (!delta) {
    return false;
  }
  ingestDelta(delta);
  return true;
}

export function ingestAllDeferred() {
  while (ingestNextDeferred());
}

export function subscribeDeltas(fn: (delta: Delta) => void) {
  deltaStream.on('delta', ({delta}) => {
    fn(delta);
  });
}

export async function publishDelta(delta: Delta) {
  debug(`Publishing delta: ${JSON.stringify(delta)}`);
  await publishSock.send(["deltas", myRequestAddr.toAddrString(), serializeDelta(delta)]);
}

function serializeDelta(delta: Delta) {
  return JSON.stringify(delta);
}

function deserializeDelta(input: string) {
  return JSON.parse(input);
}

export async function runDeltas() {
  for await (const [topic, sender, msg] of subscribeSock) {
    if (topic.toString() !== "deltas") {
      continue;
    }
    const delta = deserializeDelta(msg.toString());
    delta.receivedFrom = PeerAddress.fromString(sender.toString());
    debug(`Received delta: ${JSON.stringify(delta)}`);
    ingestDelta(delta);
  }
}

