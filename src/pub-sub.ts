import { Publisher, Subscriber } from 'zeromq';
import { PUBLISH_BIND_PORT, PUBLISH_BIND_ADDR} from './config';

export const publishSock = new Publisher();
export const subscribeSock = new Subscriber();

export async function bindPublish() {
  const addrStr = `tcp://${PUBLISH_BIND_ADDR}:${PUBLISH_BIND_PORT}`;
  await publishSock.bind(addrStr);
  console.log(`Publishing socket bound to ${addrStr}`);
}

export function connectSubscribe(host: string, port: number) {
  // TODO: peer discovery
  const addrStr = `tcp://${host}:${port}`;
  subscribeSock.connect(addrStr);
  subscribeSock.subscribe("deltas");
  console.log(`Subscribing to ${addrStr}`);
}
