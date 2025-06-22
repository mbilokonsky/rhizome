import {Collection} from "./collection-abstract";
import { ResolvedTimestampedViewOne as ResolvedViewOne } from "../views/resolvers/timestamp-resolvers";
import {TimestampResolver} from "../views/resolvers/timestamp-resolvers";

class RelationalView extends TimestampResolver {
}

export class RelationalCollection extends Collection<RelationalView> {
  declare lossy?: RelationalView;

  initializeView() {
    if (!this.rhizomeNode) throw new Error('not connected to rhizome');
    this.lossy = new RelationalView(this.rhizomeNode.lossless);
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
