'use strict';
const json=require('./builtin-json-strict.js');
const semantic=require('./builtin-json-semantic.js');
const render=require('./builtin-json-renderer.js');
const verify=require('./builtin-json-verifier.js');
module.exports={
  parsers:{json:json.parser},
  structures:{json:json.structure},
  semantics:{json:semantic.semantic},
  intentRenderers:{json:render.renderer},
  verifiers:{json:[verify.verifier]},
  deepAnalysis:{}
};
