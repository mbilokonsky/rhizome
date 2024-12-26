import { Collection } from './collection';
import {Entity, EntityProperties} from './entity';
import {LossyViewOne} from './lossy';

export class TypedCollection<T extends EntityProperties> extends Collection {
  put(id: string | undefined, properties: T): Entity {
    return super.put(id, properties);
  }

  get(id: string): LossyViewOne | undefined {
    return super.get(id);
  }
}
