import Debug from 'debug';
import jsonLogic from 'json-logic-js';

const debug = Debug('rz:scratch:jsonlogic');
const { apply } = jsonLogic;

// Example of using jsonLogic's map operation
const mapResult = apply({"map":[
  {"var":"integers"},
  {"*":[{"var":""},2]}
]}, {"integers":[1,2,3,4,5]});
debug('Map result: %o', mapResult);

// Example of using jsonLogic's reduce operation
const reduceResult = apply({"reduce":[
    {"var":"integers"},
    {"+":[{"var":"current"}, {"var":"accumulator"}]},
    0
]}, {"integers":[1,2,3,4,5]});
debug('Reduce result: %o', reduceResult);
