

> myk: 
> I think so far this seems mostly on point, but I'd focus on building the bridge between Domain Entity (lossy representation) <-> Lossless Representation <-> Delta[] I think
> the tricky stuff comes in with, like, how do you take an undifferentiated stream of deltas, a query and a schema
> and filter / merge those deltas into the lossless tree structure you need in order to then reduce into a lossy domain node
> if that part of the flow works then the rest becomes fairly self-evident
> a "lossless representation" is basically a DAG/Tree that starts with a root node whose properties each contain the deltas that assign values to them, where the delta may have a pointer up to "this" and then down to some related domain node, which gets interpolated into the tree instead of just referenced, and it has its properties contain the deltas that target it, etc
> so you need both the ID of the root node (the thing being targeted by one or more deltas) as well as the scehma to apply to determine which contexts on that target to include (target_context effectively becomes a property on the domain entity, right?), as well as which schema to apply to included referenced entities, etc.
> so it's what keeps you from returning the whole stream of deltas, while still allowing you to follow arbitrary edges


