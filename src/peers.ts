import { PUBLISH_BIND_ADDR, PUBLISH_BIND_PORT } from "./config";
import { registerRequestHandler, PeerRequest, ResponseSocket } from "./request-reply";
import { RequestSocket, } from "./request-reply";
import { SEED_PEERS } from "./config";
import {connectSubscribe} from "./pub-sub";

export enum PeerMethods {
  GetPublishAddress,
}

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
}

export async function subscribeToSeeds() {
  SEED_PEERS.forEach(async ({addr, port}, idx) => {
    console.log(`SEED PEERS[${idx}]=${addr}:${port}`);
    const peer = new Peer(addr, port);
    await peer.subscribe();
  });
}

registerRequestHandler(async (req: PeerRequest, res: ResponseSocket) => {
  console.log('inspecting peer request');
  switch (req.method) {
    case PeerMethods.GetPublishAddress:
      console.log('it\'s a request for our publish address');
      await res.send(publishAddr);
      break;
  }
});

