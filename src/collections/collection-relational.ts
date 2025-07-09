import {Collection} from "./collection-abstract";
import { ResolvedTimestampedViewOne as ResolvedViewOne } from "../views/resolvers/timestamp-resolvers";
import {TimestampResolver} from "../views/resolvers/timestamp-resolvers";

class RelationalView extends TimestampResolver {
}

export class RelationalCollection extends Collection<RelationalView> {
  declare view?: RelationalView;

  initializeView() {
    if (!this.rhizomeNode) throw new Error('not connected to rhizome');
    this.view = new RelationalView(this.rhizomeNode.hyperview);
  }

  resolve(
    id: string
  ): ResolvedViewOne | undefined {
    if (!this.rhizomeNode) throw new Error('collection not connected to rhizome');
    if (!this.view) throw new Error('view not initialized');

    const res = this.view.resolve([id]) || {};

    return res[id];
  }

}
