import { ResolverPlugin } from "./plugin";

export abstract class TargetedPlugin<T> extends ResolverPlugin<T> {
  constructor(target?: string) {
    // If no target is provided, then we want to implicitly target the property 
    // to which this plugin is attached. That means that when we apply an update,
    // we want to take the value of 
    super(target);
  }
}
    