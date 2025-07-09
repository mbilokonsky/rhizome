When a node wants to perform a write operation, what's the sequence?
Persist the write locally
  Think about how this should look from data/metadata perspective --
Propagate the write to peers
  Keep track of confidence in extent of propagation 
`*` Read-your-write will only be satisfied after a certian amount of propagation
  Views of the record must be able to clearly see its provisionality



Protocol among peers
ZeroMQ can provide messaging fabric
Nodes can request and provide certain things
Query
Subscribe

Execute a function and encode the result as a delta targeting a given entity
That gets shared via the generic fabric of propagating deltas

So a fundamental data structure that we need is for the filtering of deltas
I like JSON-Logic for this sort of use case.
Other syntaxes can be transformed into json logic if we want to suppor them.

A functional unit then would consist of a filter expression
Shall it then also include a resultant expression? Or more broadly an expression representing its logic,
which could include various actions and sequences


Address the functions on a ring and orchestrate overlapping coverage of responsibility

How will we store and access the journal?
Low level approach-- Read from disk and network, process into memory.
Pre-built technologies? LevelDB
Can use LevelDB to store deltas
Structure can correspond to our desired ontology
Layers for 
- primitives - what's a delta, schema, materialized view, view view
- delta store - allows you to persiste deltas and query over the delta stream
- materialized view store - view snapshot(s)
- view bindings - e.g. graphql, define what a user looks like, that gets application bindings
  e.g. where your resolvers come in, so that your fields aren't all arrays, i.e. you resolve conflicts

Protocol involving ZeroMQ--
Pub/sub for deltas
- Can we subdivide / convey our filter expressions?
Req/Reply for ...
- Catching up / obtaining complete set of deltas (*since some snapshot?)
Fanout/in
Pipeline

Routing--
You receive a message
Someone sent it as part of a process of attempting to...
- propagate deltas
- issue a request
Is it signed by the sending peer?
- We can probably safely prioritize these
Does the sending peer express confidence?
What is my derived confidence in the records

In general it seems we have this tradeoff available between computing everything ad hoc as needed from the most complete possible set of source data, applying all relevant filters in each scenario

Connect to multiple peers
Ask each what you might be missing

