import Debug from 'debug';
import {Publisher, Subscriber} from 'zeromq';
import {RhizomeNode} from '../node';
import {PeerAddress} from '../network/peers';
const debug = Debug('rz:pub-sub');

export type SubscribedMessageHandler = (sender: PeerAddress, msg: string) => void;

// TODO: Allow subscribing to multiple topics on one socket
export class Subscription {
  private sock: Subscriber;
  private isRunning = false;
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
    this.sock = new Subscriber();
    this.cb = cb;
    this.topic = topic;
    this.publishAddr = publishAddr;
    this.publishAddrStr = `tcp://${this.publishAddr.toAddrString()}`;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.sock.connect(this.publishAddrStr);
    this.sock.subscribe(this.topic);
    debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `Subscribing to ${this.topic} topic on ZeroMQ ${this.publishAddrStr}`);

    // Set up message handler
    const processMessage = async () => {
      try {
        if (!this.isRunning) return;
        
        // Use a promise race to handle both messages and the stop signal
        const [topic, sender, msg] = await Promise.race([
          this.sock.receive(),
          new Promise<[Buffer, Buffer, Buffer]>(() => {}).then(() => { 
            if (!this.isRunning) throw new Error('Subscription stopped'); 
            return [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)]; 
          })
        ]);
        
        if (!this.isRunning) return;
        
        const senderStr = PeerAddress.fromString(sender.toString());
        const msgStr = msg.toString();
        debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `ZeroMQ subscription received msg: ${msgStr}`);
        this.cb(senderStr, msgStr);
        
        // Process next message
        process.nextTick(processMessage);
      } catch (error) {
        if (this.isRunning) {
          debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `Error in subscription:`, error);
          // Attempt to restart the message processing
          if (this.isRunning) {
            process.nextTick(processMessage);
          }
        }
      }
    };
    
    // Start processing messages
    process.nextTick(processMessage);
  }
  
  close() {
    if (!this.isRunning) return;
    this.isRunning = false;
    try {
      this.sock.close();
      debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `Closed subscription for topic ${this.topic}`);
    } catch (error) {
      debug(`[${this.pubSub.rhizomeNode.config.peerId}]`, `Error closing subscription:`, error);
    }
  }
}

export class PubSub {
  rhizomeNode: RhizomeNode;
  publishSock?: Publisher;
  publishAddrStr: string;
  subscriptions: Subscription[] = [];

  constructor(rhizomeNode: RhizomeNode) {
    this.rhizomeNode = rhizomeNode;

    const {publishBindHost, publishBindPort} = this.rhizomeNode.config;
    this.publishAddrStr = `tcp://${publishBindHost}:${publishBindPort}`;
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

  /**
   * Check if the PubSub is running
   * @returns boolean indicating if the publisher socket is active
   */
  isRunning(): boolean {
    return !!this.publishSock;
  }

  async stop() {
    // First close all subscriptions
    for (const subscription of this.subscriptions) {
      subscription.close();
    }
    this.subscriptions = [];
    
    // Then close the publisher socket
    if (this.publishSock) {
      try {
        await this.publishSock.unbind(this.publishAddrStr);
        this.publishSock.close();
        debug(`[${this.rhizomeNode.config.peerId}]`, 'Unbound and closed publisher socket');
      } catch (error) {
        debug(`[${this.rhizomeNode.config.peerId}]`, 'Error closing publisher socket:', error);
      } finally {
        // Free the memory by taking the old object out of scope.
        this.publishSock = undefined;
      }
    }
  }
}
