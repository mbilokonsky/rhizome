import jsonLogic from 'json-logic-js';
const { apply } = jsonLogic;

console.log(apply({"map":[
  {"var":"integers"},
  {"*":[{"var":""},2]}
]}, {"integers":[1,2,3,4,5]}));

console.log(apply({"reduce":[
    {"var":"integers"},
    {"+":[{"var":"current"}, {"var":"accumulator"}]},
    0
]}, {"integers":[1,2,3,4,5]}));
