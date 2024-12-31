import {parseAddressList, PeerAddress} from '../src/peers.js';

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

  it('parseAddressList()', () => {
    const input = "255.255.255.255:99999, 0.0.0.0:0";
    const result = parseAddressList(input);
    expect(result).toHaveLength(2);
    expect(result[0].isEqual(new PeerAddress("255.255.255.255", 99999))).toBeTruthy();
    expect(result[1].isEqual(new PeerAddress("0.0.0.0", 0))).toBeTruthy();
  });
});
