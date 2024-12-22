import { PUBLISH_BIND_ADDR, PUBLISH_BIND_PORT } from "./config";
import { registerRequestHandler, PeerRequest, ResponseSocket } from "./request-reply";
import { RequestSocket, } from "./request-reply";
import { SEED_PEERS } from "./config";
import {connectSubscribe} from "./pub-sub";
import {deltasAccepted, deltasProposed, ingestAll, receiveDelta} from "./deltas";
import {Delta} from "./types";

export enum PeerMethods {
  GetPublishAddress,
  AskForDeltas
}

registerRequestHandler(async (req: PeerRequest, res: ResponseSocket) => {
  console.log('inspecting peer request');
  switch (req.method) {
    case PeerMethods.GetPublishAddress: {
      console.log('it\'s a request for our publish address');
      await res.send(publishAddr);
      break;
    }
    case PeerMethods.AskForDeltas: {
      console.log('it\'s a request for deltas');
      // TODO: stream these rather than
      // trying to write them all in one message
      await res.send(JSON.stringify(deltasAccepted));
      break;
    }
  }
});

export type PeerAddress = {
  addr: string,
  port: number
};

const publishAddr: PeerAddress = {
  addr: PUBLISH_BIND_ADDR,
  port: PUBLISH_BIND_PORT
};

class Peer {
  reqSock: RequestSocket;
  publishAddr: PeerAddress | undefined;
  constructor(addr: string, port: number) {
    this.reqSock = new RequestSocket(addr, port);
  }
  async subscribe() {
    if (!this.publishAddr) {
      const res = await this.reqSock.request(PeerMethods.GetPublishAddress);
      // TODO: input validation
      const {addr, port} = JSON.parse(res.toString());
      this.publishAddr = {addr, port};
      connectSubscribe(addr, port);
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

const peers: Peer[] = [];

function newPeer(addr: string, port: number) {
    const peer = new Peer(addr, port);
    peers.push(peer);
    return peer;
}

export async function subscribeToSeeds() {
  SEED_PEERS.forEach(async ({addr, port}, idx) => {
    console.log(`SEED PEERS[${idx}]=${addr}:${port}`);
    const peer = newPeer(addr, port);
    await peer.subscribe();
  });
}

//! TODO Expect abysmal scaling properties with this function
export async function askAllPeersForDeltas() {
  peers.forEach(async (peer, idx) => {
    console.log(`Asking peer ${idx} for deltas`);
    const deltas = await peer.askForDeltas();
    console.log('received deltas:', deltas);
    for (const delta of deltas) {
      receiveDelta(delta);
    }
    console.log('deltasProposed count', deltasProposed.length);
    console.log('deltasAccepted count', deltasAccepted.length);
    ingestAll();
  });
}
