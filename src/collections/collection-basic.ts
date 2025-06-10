// A basic collection of entities
// This may be extended to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import {Collection} from '../collections/collection-abstract';
import {LastWriteWins, ResolvedViewOne} from '../views/resolvers/last-write-wins';

export class BasicCollection extends Collection<LastWriteWins> {
  declare lossy?: LastWriteWins;

  initializeView() {
    if (!this.rhizomeNode) throw new Error('not connected to rhizome');
    this.lossy = new LastWriteWins(this.rhizomeNode.lossless);
  }

  resolve(
    id: string
  ): ResolvedViewOne | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    if (!this.lossy) throw new Error('lossy view not initialized');

    const res = this.lossy.resolve([id]) || {};

    return res[id];
  }
}
