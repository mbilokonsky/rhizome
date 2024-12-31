import { FilterExpr } from "../types.js";
// import { map } from 'radash';

// A creator as seen by a host
type OriginPoint = {
  creator: string;
  host: string;
};

class Party {
  originPoints: OriginPoint[];
  constructor(og: OriginPoint) {
    this.originPoints = [og];
  }
  getAddress() {
    const { creator, host } = this.originPoints[0];
    return `${creator}@${host}`;
  }
}

const knownParties = new Set<Party>();
export const countKnownParties = () => knownParties.size;

export function generateFilter(): FilterExpr {
// map(knownParties, (p: Party) => p.address]
  //
  
  const addresses = [...knownParties.values()].map(p => p.getAddress());

  return {
    'in': ['$creatorAddress', addresses]
  };
};
