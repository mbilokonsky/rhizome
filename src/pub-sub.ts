import {Publisher, Subscriber} from 'zeromq';
import {PUBLISH_BIND_ADDR, PUBLISH_BIND_PORT} from './config';
import {PeerAddress} from './types';

export const publishSock = new Publisher();
export const subscribeSock = new Subscriber();

export async function bindPublish() {
  const addrStr = `tcp://${PUBLISH_BIND_ADDR}:${PUBLISH_BIND_PORT}`;
  await publishSock.bind(addrStr);
  console.log(`Publishing socket bound to ${addrStr}`);
}

export function connectSubscribe(publishAddr: PeerAddress) {
  // TODO: peer discovery
  const addrStr = `tcp://${publishAddr.toAddrString()}`;
  console.log('connectSubscribe', {addrStr});
  subscribeSock.connect(addrStr);
  subscribeSock.subscribe("deltas");
  console.log(`Subscribing to ${addrStr}`);
}
