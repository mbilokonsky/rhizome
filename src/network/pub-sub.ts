import Debug from 'debug';
import {Publisher, Subscriber} from 'zeromq';
import {RhizomeNode} from '../node';
import {PeerAddress} from '../network/peers';
const debug = Debug('rz:pub-sub');

export type SubscribedMessageHandler = (sender: PeerAddress, msg: string) => void;

// TODO: Allow subscribing to multiple topics on one socket
export class Subscription {
  sock = new Subscriber();
  topic: string;
  publishAddr: PeerAddress;
  publishAddrStr: string;
  cb: SubscribedMessageHandler;

  constructor(
    readonly pubSub: PubSub,
    publishAddr: PeerAddress,
    topic: string,
    cb: SubscribedMessageHandler,
  ) {
    this.cb = cb;
    this.topic = topic;
    this.publishAddr = publishAddr;
    this.publishAddrStr = `tcp://${this.publishAddr.toAddrString()}`;
  }

  async start() {
    this.sock.connect(this.publishAddrStr);
    this.sock.subscribe(this.topic);
    debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `Subscribing to ${this.topic} topic on ZeroMQ ${this.publishAddrStr}`);

    // Wait for ZeroMQ messages.
    // This will block indefinitely.
    for await (const [, sender, msg] of this.sock) {
      const senderStr = PeerAddress.fromString(sender.toString());
      const msgStr = msg.toString();
      debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `ZeroMQ subscribtion received msg: ${msgStr}`);
      this.cb(senderStr, msgStr);
    }

    debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `Done waiting for subscription socket for topic ${this.topic}`);
  }
}

export class PubSub {
  rhizomeNode: RhizomeNode;
  publishSock?: Publisher;
  publishAddrStr: string;
  subscriptions: Subscription[] = [];

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;

    const {publishBindAddr, publishBindPort} = this.rhizomeNode.config;
    this.publishAddrStr = `tcp://${publishBindAddr}:${publishBindPort}`;
  }

  async startZmq() {
    this.publishSock = new Publisher();

    await this.publishSock.bind(this.publishAddrStr);
    debug(`[${this.rhizomeNode.config.peerId}]`, `ZeroMQ publishing socket bound to ${this.publishAddrStr}`);
  }

  async publish(topic: string, msg: string) {
    if (this.publishSock) {
      await this.publishSock.send([
        topic,
        this.rhizomeNode.myRequestAddr.toAddrString(),
        msg
      ]);
      debug(`[${this.rhizomeNode.config.peerId}]`, `Published to ZeroMQ, msg: ${msg}`);
    }
  }

  subscribe(
    publishAddr: PeerAddress,
    topic: string,
    cb: SubscribedMessageHandler
  ): Subscription {
    const subscription = new Subscription(this, publishAddr, topic, cb);
    this.subscriptions.push(subscription);
    return subscription;
  }

  async stop() {
    if (this.publishSock) {
      await this.publishSock.unbind(this.publishAddrStr);
      this.publishSock.close();
      // Free the memory by taking the old object out of scope.
      this.publishSock = undefined;
    }

    for (const subscription of this.subscriptions) {
      subscription.sock.close();
    }
  }
}
