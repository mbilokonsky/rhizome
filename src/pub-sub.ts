import {GossipSub, gossipsub} from '@chainsafe/libp2p-gossipsub';
import {noise} from '@chainsafe/libp2p-noise';
import {yamux} from '@chainsafe/libp2p-yamux';
import {identify} from '@libp2p/identify';
import {mdns} from '@libp2p/mdns';
import {ping} from '@libp2p/ping';
import {tcp} from '@libp2p/tcp';
import Debug from 'debug';
import {Libp2p, createLibp2p} from 'libp2p';
import {Publisher, Subscriber} from 'zeromq';
import {RhizomeNode} from './node.js';
import {PeerAddress} from './peers.js';
const debug = Debug('rz:pub-sub');

export type SubscribedMessageHandler = (sender: PeerAddress, msg: string) => void;

// TODO: Allow subscribing to multiple topics on one socket
export class Subscription {
  sock = new Subscriber();
  topic: string;
  publishAddr: PeerAddress;
  publishAddrStr: string;
  cb: SubscribedMessageHandler;
  libp2p?: Libp2p;

  constructor(
    readonly pubSub: PubSub,
    publishAddr: PeerAddress,
    topic: string,
    cb: SubscribedMessageHandler,
    libp2p?: Libp2p
  ) {
    this.cb = cb;
    this.topic = topic;
    this.publishAddr = publishAddr;
    this.publishAddrStr = `tcp://${this.publishAddr.toAddrString()}`;
    this.libp2p = libp2p;
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

    debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `done waiting for subscription socket for topic ${this.topic}`);
  }
}

export class PubSub {
  rhizomeNode: RhizomeNode;
  publishSock: Publisher;
  publishAddrStr: string;
  subscriptions: Subscription[] = [];
  libp2p?: Libp2p;

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;
    this.publishSock = new Publisher();

    const {publishBindAddr, publishBindPort} = this.rhizomeNode.config;
    this.publishAddrStr = `tcp://${publishBindAddr}:${publishBindPort}`;
  }

  async start() {
    await this.publishSock.bind(this.publishAddrStr);
    debug(`[${this.rhizomeNode.config.peerId}]`, `ZeroMQ publishing socket bound to ${this.publishAddrStr}`);

    this.libp2p = await createLibp2p({
      addresses: {
        // TODO: Config
        listen: ['/ip4/127.0.0.1/tcp/0']
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: [mdns()],
      services: {
        pubsub: gossipsub(),
        identify: identify(),
        ping: ping(),
      }
    });

    this.libp2p.addEventListener("peer:discovery", (event) => {
      debug(`[${this.rhizomeNode.config.peerId}]`, `found peer: ${JSON.stringify(event.detail)}`);
      this.libp2p?.dial(event.detail.multiaddrs);
    });

    this.libp2p.addEventListener("peer:connect", (event) => {
      debug(`[${this.rhizomeNode.config.peerId}]`, `connected to peer: ${JSON.stringify(event.detail)}`);
    });
  }

  async publish(topic: string, msg: string) {
    debug(`[${this.rhizomeNode.config.peerId}]`, `publishing to ZeroMQ, msg: ${msg}`);
    await this.publishSock.send([
      topic,
      this.rhizomeNode.myRequestAddr.toAddrString(),
      msg
    ]);

    if (this.libp2p) {
      const pubsub = this.libp2p.services.pubsub as GossipSub;
      debug(`[${this.rhizomeNode.config.peerId}]`, `publishing to Libp2p, msg: ${msg}`);
      try {
        await pubsub.publish(topic, Buffer.from(msg));
      } catch (e: unknown) {
        debug(`[${this.rhizomeNode.config.peerId}]`, 'Libp2p publish:', (e as Error).message);
      }
    }
  }

  subscribedTopics = new Set<string>();

  subscribeTopic(topic: string, cb: SubscribedMessageHandler) {
    if (!this.libp2p) throw new Error('libp2p not initialized');
    const pubsub = this.libp2p.services.pubsub as GossipSub;

    // TODO: If we subscribe to multiple topics this callback will be duplicated
    pubsub.addEventListener("message", (event) => {
      const msg = Buffer.from(event.detail.data).toString();
      debug(`[${this.rhizomeNode.config.peerId}]`, `Libp2p subscribtion received msg: ${msg}`);
      cb(new PeerAddress('libp2p', 0), msg);
    });

    // Add to our list of subscribed topics so we can unsubscribe later.
    // Also has the effect of not calling subscribe more than once per topic.
    if (!this.subscribedTopics.has(topic)) {
      pubsub.subscribe(topic);
      this.subscribedTopics.add(topic);
      debug(`[${this.rhizomeNode.config.peerId}]`, 'subscribed topics:', Array.from(this.subscribedTopics.keys()));
    }
  }

  subscribe(
    publishAddr: PeerAddress,
    topic: string,
    cb: SubscribedMessageHandler
  ): Subscription {
    const subscription = new Subscription(this, publishAddr, topic, cb, this.libp2p);
    this.subscriptions.push(subscription);
    return subscription;
  }

  async stop() {
    await this.publishSock.unbind(this.publishAddrStr);
    this.publishSock.close();
    this.publishSock = new Publisher();

    for (const subscription of this.subscriptions) {
      subscription.sock.close();
    }

    if (this.libp2p) {
      const pubsub = this.libp2p.services.pubsub as GossipSub;

      pubsub.removeEventListener("message");

      for (const topic of this.subscribedTopics) {
        debug(`[${this.rhizomeNode.config.peerId}]`, `unsubscribing Libp2p topic ${topic}`);
        pubsub.unsubscribe(topic)
      }

      debug(`[${this.rhizomeNode.config.peerId}]`, 'stopping gossipsub');

      await pubsub.stop();

      await this.libp2p.stop();

      debug(`[${this.rhizomeNode.config.peerId}]`, 'stopped libp2p');

    }
  }
}
