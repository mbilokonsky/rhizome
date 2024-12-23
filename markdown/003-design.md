node should be able to store and retrieve data, send and receive messages, perform computations

what is an appropriate runtime for this?
erlang?

nodejs?

custom - rust, c

bash, 
php,
lua

what are the main features we want/need?

key value storage
socket listening
message handling
storage management
policy declarations/implementations
communications layer
confidence levels, derived confidence levels

possible architecture
---

tinc vpn
each node has a private key
network must seed with some out-of-band public key exchanges
once the network is seeded, participating nodes can propagate new public keys to be onboarded
simple daemon should run on each node
if it has a static public IP, it advertises it
If it has a dns record, it may advertise it
Peers may discover it's IP through STUN/TURN type arrangement - tinc may be handling that

What if we use HTTP for the protocol? So e.g. curl can be used for manual testing.

nodejs with leveldb could be a reasonable way to start a prototype
maybe try to use typescript for good measure

rust or erlang do seem stronger than nodejs

in any case we probably want to run our node and its dependencies in containers
do we want to use kubernetes? helm?

tinc could be good for facilitating operations among the dev team

node maintains a set of functions and the streams that feed them
executes the functions that it's configured to execute
within the contexts they're configured to use
perhaps creating new deltas representing the results of ingesting some deltas

so we want to be able to ask a node:
what have you seen?
What have you accepted/how confident are you about xyz




 


