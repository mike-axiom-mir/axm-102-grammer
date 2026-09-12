'use strict';

const {TextDecoder}=require('util');
const strict=require('./builtin-json-strict.js');

function hasError(root){const stack=[root];while(stack.length){const n=stack.pop();if(n.error===true||n.missing===true||n.type==='ERROR')return true;for(const c of n.children||[])stack.push(c);}return false;}

const verifier={
  id:'axm.builtin.json.verifier.v1',
  kind:'verifier',
  implementation:'strict-json-byte-parser-plus-native-json-parse',
  version:'1.0.0',
  artifactSha256:'UNBOUND_REPOSITORY_SOURCE',
  deterministic:true,
  offlineReady:true,
  costRank:1,
  verify:({source})=>{
    const parsed=strict.parseJsonBytes(source);
    if(hasError(parsed.root))return{state:'FAIL',summary:'STRICT_JSON_PARSE_FAILED',facts:['strict byte parser rejected candidate']};
    try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source));}
    catch(e){return{state:'FAIL',summary:'NATIVE_JSON_PARSE_FAILED',facts:[String(e.message||e)]};}
    return{state:'PASS',summary:'STRICT_JSON_VALID',facts:['strict byte parser pass','JSON.parse pass']};
  }
};

module.exports={verifier,hasError};
