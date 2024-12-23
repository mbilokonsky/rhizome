import {PeerAddress} from '../src/types';

describe('PeerAddress', () => {
  it('toString()', () => {
    const addr = new PeerAddress('localhost', 1000);
    expect(addr.toAddrString()).toBe("localhost:1000");
  });
  it('fromString()', () => {
    const addr = PeerAddress.fromString("localhost:1000");
    expect(addr.addr).toBe("localhost");
    expect(addr.port).toBe(1000);
  });
});
