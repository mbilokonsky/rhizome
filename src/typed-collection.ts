import {Collection} from './collection';
import {EntityProperties} from './entity';
import {LossyViewOne} from './lossy';
import {DomainEntityID} from './types';

export class TypedCollection<T extends EntityProperties> extends Collection {
  async put(id: DomainEntityID | undefined, properties: T): Promise<LossyViewOne> {
    return super.put(id, properties);
  }
}
