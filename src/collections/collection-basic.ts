// A basic collection of entities
// This may be extended to house a collection of objects that all follow a common schema.
// It should enable operations like removing a property removes the value from the entities in the collection
// It could then be further extended with e.g. table semantics like filter, sort, join

import {Collection} from '../collections/collection-abstract';
import {TimestampResolver} from '../views/resolvers/timestamp-resolvers';

export class BasicCollection extends Collection<TimestampResolver> {
  declare view?: TimestampResolver;

  initializeView() {
    if (!this.rhizomeNode) throw new Error('not connected to rhizome');
    this.view = new TimestampResolver(this.rhizomeNode.hyperview);
  }

  resolve(
    id: string
  ) {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    if (!this.view) throw new Error('view not initialized');

    const res = this.view.resolve([id]) || {};

    return res[id];
  }
}
