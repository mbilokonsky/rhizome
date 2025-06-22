# Resolvers (Views)

The workhorse of this system is likely going to be our lossy views.
This is where the computation likely generally occurs.

So, let's talk about how to create a view. 

A lossy view initializes from a given lossless view.
The lossless view dispatches events when entity properties are updated.

View semantics are similar to map-reduce, resolvers in Redux, etc. 

The key is to identify your accumulator object. 
Your algorithm SHOULD be implemented so that the reducer is a pure function.
All state must therefore be stored in the accumulator.
