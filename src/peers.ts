import {PUBLISH_BIND_HOST, PUBLISH_BIND_PORT, REQUEST_BIND_HOST, REQUEST_BIND_PORT, SEED_PEERS} from "./config";
import {deltasAccepted, ingestAll, receiveDelta} from "./deltas";
import {connectSubscribe} from "./pub-sub";
import {PeerRequest, registerRequestHandler, RequestSocket, ResponseSocket} from "./request-reply";
import {Delta, PeerAddress} from "./types";
import Debug from 'debug';
const debug = Debug('peers');

export enum PeerMethods {
  GetPublishAddress,
  AskForDeltas
}

export const myRequestAddr = new PeerAddress(REQUEST_BIND_HOST, REQUEST_BIND_PORT);
export const myPublishAddr = new PeerAddress(PUBLISH_BIND_HOST, PUBLISH_BIND_PORT);

registerRequestHandler(async (req: PeerRequest, res: ResponseSocket) => {
  debug('inspecting peer request');
  switch (req.method) {
    case PeerMethods.GetPublishAddress: {
      debug('it\'s a request for our publish address');
      await res.send(myPublishAddr.toAddrString());
      break;
    }
    case PeerMethods.AskForDeltas: {
      debug('it\'s a request for deltas');
      // TODO: stream these rather than
      // trying to write them all in one message
      await res.send(JSON.stringify(deltasAccepted));
      break;
    }
  }
});

class Peer {
  reqAddr: PeerAddress;
  reqSock: RequestSocket;
  publishAddr: PeerAddress | undefined;
  isSelf: boolean;
  isSeedPeer: boolean;
  constructor(addr: string, port: number) {
    this.reqAddr = new PeerAddress(addr, port);
    this.reqSock = new RequestSocket(addr, port);
    this.isSelf = addr === myRequestAddr.addr && port === myRequestAddr.port;
    this.isSeedPeer = !!SEED_PEERS.find((seedPeer) =>
      addr === seedPeer.addr && port === seedPeer.port);
  }
  async subscribe() {
    if (!this.publishAddr) {
      const res = await this.reqSock.request(PeerMethods.GetPublishAddress);
      // TODO: input validation
      this.publishAddr = PeerAddress.fromString(res.toString());
      connectSubscribe(this.publishAddr!);
    }
  }
  async askForDeltas(): Promise<Delta[]> {
    // TODO as a first approximation we are trying to cram the entire history
    // of accepted deltas, into one (potentially gargantuan) json message.
    // A second approximation would be to stream the deltas.
    // Third pass should find a way to reduce the number of deltas transmitted.

    // TODO: requestTimeout
    const res = await this.reqSock.request(PeerMethods.AskForDeltas);
    const deltas = JSON.parse(res.toString());
    return deltas;
  }
}

export const peers: Peer[] = [];

peers.push(new Peer(myRequestAddr.addr, myRequestAddr.port));

function newPeer(addr: string, port: number) {
  const peer = new Peer(addr, port);
  peers.push(peer);
  return peer;
}

export async function subscribeToSeeds() {
  SEED_PEERS.forEach(async ({addr, port}, idx) => {
    debug(`SEED PEERS[${idx}]=${addr}:${port}`);
    const peer = newPeer(addr, port);
    await peer.subscribe();
  });
}

//! TODO Expect abysmal scaling properties with this function
export async function askAllPeersForDeltas() {
  peers
    .filter(({isSelf}) => !isSelf)
    .forEach(async (peer, idx) => {
      debug(`Asking peer ${idx} for deltas`);
      const deltas = await peer.askForDeltas();
      debug(`received ${deltas.length} deltas from ${peer.reqAddr.toAddrString()}`);
      for (const delta of deltas) {
        delta.receivedFrom = peer.reqAddr;
        receiveDelta(delta);
      }
      ingestAll();
    });
}
