import Debug from 'debug';
import {Message, Publisher, Subscriber} from 'zeromq';
import {RhizomeNode} from './node';
import {PeerAddress} from './types';
const debug = Debug('pub-sub');

export type SubscribedMessageHandler = (sender: PeerAddress, msg: Message) => void;

// TODO: Allow subscribing to multiple topics on one socket
export class Subscription {
  sock = new Subscriber();
  topic: string;
  publishAddr: PeerAddress;
  publishAddrStr: string;
  cb: SubscribedMessageHandler;

  constructor(publishAddr: PeerAddress, topic: string, cb: SubscribedMessageHandler) {
    this.cb = cb;
    this.topic = topic;
    this.publishAddr = publishAddr;
    this.publishAddrStr = `tcp://${this.publishAddr.toAddrString()}`;
  }

  async start() {
    this.sock.connect(this.publishAddrStr);
    this.sock.subscribe(this.topic);
    debug(`Subscribing to ${this.topic} topic on ${this.publishAddrStr}`);

    for await (const [, sender, msg] of this.sock) {
      const senderAddr = PeerAddress.fromString(sender.toString());
      this.cb(senderAddr, msg);
    }
  }
}

export class PubSub {
  rhizomeNode: RhizomeNode;
  publishSock: Publisher;
  publishAddrStr: string;
  subscriptions: Subscription[] = [];

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
    this.publishSock = new Publisher();

    const {publishBindAddr, publishBindPort} = this.rhizomeNode.config;
    this.publishAddrStr = `tcp://${publishBindAddr}:${publishBindPort}`;
  }

  async start() {
    await this.publishSock.bind(this.publishAddrStr);
    debug(`Publishing socket bound to ${this.publishAddrStr}`);
  }

  async publish(topic: string, msg: string) {
    await this.publishSock.send([
      topic,
      this.rhizomeNode.myRequestAddr.toAddrString(),
      msg
    ]);
  }

  subscribe(publishAddr: PeerAddress, topic: string, cb: SubscribedMessageHandler): Subscription {
    const subscription = new Subscription(publishAddr, topic, cb);
    this.subscriptions.push(subscription);
    return subscription;
  }

  async stop() {
    await this.publishSock.unbind(this.publishAddrStr);
    this.publishSock.close();
    this.publishSock = new Publisher();

    for (const subscription of this.subscriptions) {
      subscription.sock.close();
      debug('subscription socket is closed?', subscription.sock.closed);
    }
  }
}
