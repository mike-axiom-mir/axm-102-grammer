'use strict';

const crypto=require('crypto');

function hash(v){return crypto.createHash('sha256').update(String(v)).digest('hex');}
function pointerToken(v){return String(v).replace(/~/g,'~0').replace(/\//g,'~1');}
function decodeJsonString(source,node){return JSON.parse(source.subarray(node.startByte,node.endByte).toString('utf8'));}

const semantic={
  id:'axm.builtin.json.semantic.v1',
  kind:'semantic',
  implementation:'json-pointer-native-semantic-index',
  version:'1.0.0',
  artifactSha256:'UNBOUND_REPOSITORY_SOURCE',
  deterministic:true,
  offlineReady:true,
  languages:['json'],
  index:({documentId,source,syntaxPassport})=>{
    const nodes=[],edges=[];
    const root=syntaxPassport.syntax.root.children?.[0]||null;
    if(!root)return{nodes,edges};
    function add(valueNode,pointer,parentNodeId=null){
      const nodeId=`json.node.${hash(`${documentId}\u0000${pointer}\u0000${valueNode.startByte}:${valueNode.endByte}`).slice(0,28)}`;
      nodes.push({nodeId,kind:'JSON_VALUE',nativeKind:valueNode.type,documentId,symbol:pointer,displayName:pointer||'/',startByte:valueNode.startByte,endByte:valueNode.endByte,native:{jsonPointer:pointer||'/',valueKind:valueNode.type}});
      if(parentNodeId)edges.push({kind:'CONSUMES',from:parentNodeId,to:nodeId,nativeKind:'JSON_CONTAINS',attributes:{relation:'contains'}});
      if(valueNode.type==='object'){
        for(const pair of valueNode.children||[]){
          if(pair.type!=='pair')continue;
          const keyNode=(pair.children||[]).find(x=>x.fieldName==='key');
          const child=(pair.children||[]).find(x=>x.fieldName==='value');
          if(!keyNode||!child)continue;
          const key=decodeJsonString(source,keyNode);
          add(child,`${pointer}/${pointerToken(key)}`,nodeId);
        }
      }else if(valueNode.type==='array'){
        let index=0;
        for(const child of valueNode.children||[]){
          if(child.fieldName!=='element')continue;
          add(child,`${pointer}/${index}`,nodeId);index++;
        }
      }
      return nodeId;
    }
    add(root,'');
    return{nodes,edges};
  }
};

module.exports={semantic,pointerToken,decodeJsonString};
