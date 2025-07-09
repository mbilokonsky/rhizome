2024-12-14 2-4pm CST

myk: small IP considerations due to 15 years ago some work done for a company

databases hold on to state
e.g. a query can be answered by this information
table ops can be optimized with relational algebra
p. good ontology
so why change? what needs improvement?
e.g. schema changes
it's possible but it introduces complexity
ex. different departments in same company, modeling same things differently in parallel
last write wins
effects of decisions stack; you're stuck with what's already been done

relational means records are defined in reference to other records
nosql, no schema, can change things easily
but, hard to produce coherent materialized view

at some point data lakes became a thing, which works but means your eng. team is now part of your db.

changes cost more over time
early changes are impactful
ideally we want a flexible ontology


need to be able to see both the dao and the ten thousand things

append only stream of immutable deltas - crdt
assemble a sequence of deltas to obtain a materialized view

-- q: how to index for query optimization?
a: a succession of more specialized caches / layers of view composition

-- q: graph?
a: hypergraph -- domain nodes never reference each other, only connected by the deltas that reference them

now instead of relational tables, that information is pulled into deltas

does that make sense, asks myk?

-- q: why is it called a delta?
because it represents a change in state, and metadata associated with that change

-- q: how to operationalize the management? to define useful ontoligies and pragmatic procedures for usage

-- q: computational objects?

databases could subscribe to one another

-- q: we've talked about indexing, how are we formulating queries?
a db is a func that persists information
a subtype is a query which is a func that returns information
function application, connect by hyperedges,
can have a function that's a query edge

binding between persistence tier and query tier is loose

stuff they tried e.g. storing keys and grouping them, etc... not necessarily what we want


say a db is forked, 2 copies extended separately for a year, then you want to merge them

hopping back to computation
myk's WTF moment about this system
say we define a function that takes t-shirt specs and places an order, invoking a remote API
what if I don't have a remote API, just a friend with a t-shirt printer?
friend can be the implementation of that function
I just send them a form to complete, with shipping info etc
Now there's a human in my functional dependency chain

Normally with a db there's the notion of canonical source of truth
this system doesn't have that

-- q: trust model, threat model

provenance?

-- q: distributed system considerations



what if schemas have diverged?
in a traditional graph you only get what you select

what if, instead of edge nodes, embeddings?
embedding like in llm context
e.g. embedding of word "friends"
gives you the _numbers_ associated with that term
semantic map
coordinates in semantic space


-- q: as an attacker could I hijack deltas?
depends on our trust model


agnostic to implementation
high level structure

strange loop conference
turning the database inside out

-- q: details of content of each delta:
set of bindings
assertions targeting particular properties of entities
each binding gets a name

-- q: each delta implies a context?



suggested path: write a set of assertions
those serve as the specification

initial rollout possibility
toy model that may or may not grow
each participant gets their own data store
should be able to choose to share certain deltas with certain people?

-- q: 



store
retrieve
send
receive
compute

you could invoke a function by inserting some deltas into the graph, is a concept we're pointing to

e.g. a "publish" function that notifies another user
can share with the other user so they can activate that behavior
smalltalk type messaging structure on top of the database
note dimensions of attack surface

layers:
primitives - what's a delta, schema, materialized view, view view
delta store - allows you to persiste deltas and query over the delta stream
materialized view store - view snapshot(s)
view bindings - e.g. graphql, define what a user looks like, that gets application bindings
e.g. where your resolvers come in, so that your fields aren't all arrays, i.e. you resolve conflicts

-- idea: diff tools
comparing, merging suggestions

-- idea: operations encoded as deltas, that agents can execute


tangent: absential properties
things that are absent from a model can have significance
causal absence-- something that is absent but which caused a thing to be the way it is


schema
we'd keep a bucket of myk as a user, that combinatorially combines associated schemas

every network that you have access to is within your query space

so... some data types could be more collaborative

adding a field to a delta doesn't add it to a materialized view automatically-- but that's a good thing




