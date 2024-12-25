import { Collection } from './collection';
import {Entity, EntityProperties} from './object-layer';

export class TypedCollection<T extends EntityProperties> extends Collection {
  put(id: string | undefined, properties: T): Entity {
    return super.put(id, properties);
  }

  get(id: string): Entity | undefined {
    return super.get(id);
  }
}
