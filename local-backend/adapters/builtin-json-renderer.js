'use strict';

const crypto=require('crypto');
const strict=require('./builtin-json-strict.js');

function sha256(v){return crypto.createHash('sha256').update(v).digest('hex');}
function parseClean(buffer){const result=strict.parseJsonBytes(buffer);const stack=[result.root];while(stack.length){const n=stack.pop();if(n.error===true||n.missing===true||n.type==='ERROR')return false;for(const c of n.children||[])stack.push(c);}return true;}
function replacementBytes(args={}){
  if(Object.prototype.hasOwnProperty.call(args,'replacementJson')){
    const b=Buffer.from(String(args.replacementJson),'utf8');
    if(!parseClean(b))throw Error('JSON_REPLACEMENT_INVALID');
    return b;
  }
  if(Object.prototype.hasOwnProperty.call(args,'value')){
    const encoded=JSON.stringify(args.value);
    if(encoded===undefined)throw Error('JSON_VALUE_NOT_SERIALIZABLE');
    return Buffer.from(encoded,'utf8');
  }
  throw Error('JSON_REPLACEMENT_REQUIRED');
}

const renderer={
  id:'axm.builtin.json.intent-renderer.v1',
  kind:'renderer',
  implementation:'json-semantic-node-byte-replacement',
  version:'1.0.0',
  artifactSha256:'UNBOUND_REPOSITORY_SOURCE',
  deterministic:true,
  offlineReady:true,
  languages:['json'],
  render:({source,intent,semanticGraph})=>{
    const presses=intent.schema==='axm.code.machine-key-program.v1'?intent.presses:[intent];
    if(!semanticGraph)return{result:'RENDER_HELD_SEMANTIC_GRAPH_REQUIRED',edits:[]};
    const edits=[];
    for(const press of presses){
      if(!['REPLACE_NODE','BIND_VALUE'].includes(press.opcode))return{result:'RENDER_HELD_UNSUPPORTED_INTENT',unsupportedOpcode:press.opcode,edits:[]};
      const target=semanticGraph.nodes.find(n=>n.nodeId===String(press.targetRef||''));
      if(!target)return{result:'RENDER_HELD_TARGET_NOT_FOUND',targetRef:press.targetRef||null,edits:[]};
      const replacement=replacementBytes(press.arguments||{});
      edits.push({editId:`json-${press.sequence??edits.length+1}`,startByte:target.startByte,endByte:target.endByte,replacement,expectedSha256:sha256(source.subarray(target.startByte,target.endByte)),reason:press.opcode,sourceFactId:target.nodeId});
    }
    return{result:'RENDER_EDITS_READY',edits};
  }
};

module.exports={renderer,replacementBytes,parseClean};
