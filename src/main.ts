import express from "express";
import { runDeltas } from "./deltas";
import {HTTP_API_ENABLE, HTTP_API_ADDR, HTTP_API_PORT} from "./config";

const app = express()

app.get("/", (req: express.Request, res: express.Response) => {
    res.json({ message: "Welcome to the Express + TypeScript Server!" });
});

if (HTTP_API_ENABLE) {
  app.listen(HTTP_API_PORT, HTTP_API_ADDR, () => {
      console.log(`HTTP API bound to http://${HTTP_API_ADDR}:${HTTP_API_PORT}`);
  });
}
    
// TODO: Endpoint: Receive a delta
// 
// TODO: Websockets
// TODO: UDP
// TODO: ZeroMQ
//
// TODO: Endpoint: Query (materialized view)
// TODO: Endpoint: Info about peers
// TODO: Propagate information about peers (~gossip / or maybe just same as other kinds of deltas)
// So we dogfood the delta data structure and the distributed architecture
//
//
// TODO: Collections of functions
// How are we defining functions?
// Transformations?
// Inputs, calculations, outputs;
// Tx/Rx/Store/Retrieve/Compute;
// Schedule?
//
//
// What assumptions, if any, can we or do we want to make about our operating envoronment/situation?
// How much continuity dare we hope for?
// It's going to depend on the use case

// You simply want a formula for expressing your confidence in things

// That can be encoded as deltas

runDeltas();
