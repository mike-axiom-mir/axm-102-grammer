'use strict';

const crypto=require('crypto');
const registry=require('./registry.js');

const MAX_NODES=1_000_000;
const MAX_DEPTH=512;
const AUTHORITY=Object.freeze({workspaceRead:false,workspaceMutation:false,toolExecution:false,network:false,install:false,promotion:false,canon:false});

function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canon).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;}
function hashBytes(v){return crypto.createHash('sha256').update(v).digest('hex');}
function hash(v){return hashBytes(typeof v==='string'?Buffer.from(v):Buffer.from(canon(v)));}
function sourceBuffer(source){if(Buffer.isBuffer(source))return Buffer.from(source);if(typeof source==='string')return Buffer.from(source,'utf8');throw Error('PARSER_SOURCE_MUST_BE_STRING_OR_BUFFER');}
function text(v,name){if(typeof v!=='string'||!v)throw Error(`PARSER_ADAPTER_${name}_INVALID`);return v;}
function adapterIdentity(adapter){
  if(!adapter||typeof adapter!=='object'||Array.isArray(adapter))throw Error('PARSER_ADAPTER_INVALID');
  const body={
    id:text(adapter.id,'ID'),kind:text(adapter.kind||'parser','KIND'),implementation:text(adapter.implementation,'IMPLEMENTATION'),version:String(adapter.version||'UNKNOWN'),artifactSha256:String(adapter.artifactSha256||'UNBOUND'),
    deterministic:adapter.deterministic===true,offlineReady:adapter.offlineReady===true,languages:Array.isArray(adapter.languages)?[...new Set(adapter.languages.map(String))].sort():[],
  };
  if(!body.deterministic)throw Error('PARSER_ADAPTER_NOT_DETERMINISTIC');
  if(!body.offlineReady)throw Error('PARSER_ADAPTER_NOT_OFFLINE_READY');
  if(typeof adapter.parse!=='function')throw Error('PARSER_ADAPTER_PARSE_MISSING');
  return Object.freeze({...body,adapterSha256:hash(body)});
}
function safeAttrs(v){
  if(v==null)return null;
  if(typeof v!=='object'||Array.isArray(v))throw Error('PARSER_NODE_ATTRIBUTES_INVALID');
  const out={};
  for(const [k,x] of Object.entries(v)){
    if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(k))throw Error('PARSER_NODE_ATTRIBUTE_KEY_INVALID');
    if(x===null||['string','number','boolean'].includes(typeof x))out[k]=x;
    else throw Error(`PARSER_NODE_ATTRIBUTE_VALUE_INVALID:${k}`);
  }
  return out;
}
function normalizeTree(root,sourceLength){
  let count=0;
  const errors=[];
  function walk(node,depth,parentRange){
    if(depth>MAX_DEPTH)throw Error('PARSER_TREE_DEPTH_LIMIT');
    if(!node||typeof node!=='object'||Array.isArray(node))throw Error('PARSER_NODE_INVALID');
    count++;if(count>MAX_NODES)throw Error('PARSER_TREE_NODE_LIMIT');
    const type=text(node.type,'NODE_TYPE');
    const startByte=Number(node.startByte),endByte=Number(node.endByte);
    if(!Number.isInteger(startByte)||!Number.isInteger(endByte)||startByte<0||endByte<startByte||endByte>sourceLength)throw Error(`PARSER_NODE_RANGE_INVALID:${type}`);
    if(parentRange&&(startByte<parentRange[0]||endByte>parentRange[1]))throw Error(`PARSER_CHILD_OUTSIDE_PARENT:${type}`);
    const rawChildren=node.children==null?[]:node.children;
    if(!Array.isArray(rawChildren))throw Error(`PARSER_NODE_CHILDREN_INVALID:${type}`);
    const children=rawChildren.map(x=>walk(x,depth+1,[startByte,endByte]));
    for(let i=1;i<children.length;i++)if(children[i].startByte<children[i-1].startByte)throw Error(`PARSER_CHILD_ORDER_INVALID:${type}`);
    const normalized={type,startByte,endByte,fieldName:node.fieldName==null?null:String(node.fieldName),error:node.error===true||type==='ERROR',missing:node.missing===true,attributes:safeAttrs(node.attributes),children};
    if(normalized.error||normalized.missing)errors.push({type,startByte,endByte,error:normalized.error,missing:normalized.missing});
    return normalized;
  }
  const tree=walk(root,0,null);
  if(tree.startByte!==0||tree.endByte!==sourceLength)throw Error('PARSER_ROOT_MUST_COVER_SOURCE_BYTES');
  return Object.freeze({tree,nodeCount:count,errors:Object.freeze(errors)});
}
function parse({languageId,source,adapter}={}){
  const organ=registry.getByLanguageId(languageId);
  if(!organ)return Object.freeze({schema:'axm.code.syntax-passport.v1',result:'UNKNOWN_LANGUAGE',languageId:languageId||null,authority:'NONE'});
  const bytes=sourceBuffer(source),identity=adapterIdentity(adapter);
  if(identity.languages.length&&!identity.languages.includes(languageId))return Object.freeze({schema:'axm.code.syntax-passport.v1',result:'PARSER_LANGUAGE_UNSUPPORTED',languageId,parser:identity,authority:'NONE'});
  const raw=adapter.parse({languageId,source:Buffer.from(bytes)});
  if(raw&&typeof raw.then==='function')throw Error('ASYNC_PARSER_NOT_ALLOWED_IN_DETERMINISTIC_SPINE');
  if(!raw||typeof raw!=='object'||!raw.root)throw Error('PARSER_RESULT_ROOT_MISSING');
  const normalized=normalizeTree(raw.root,bytes.length);
  const state=normalized.errors.length?'PARSED_WITH_ERRORS':'PARSED';
  const treeDigest=hash(normalized.tree);
  const core={
    schema:'axm.code.syntax-passport.v1',version:'1.0.0',result:state,languageId,organId:organ.organId,organDigest:organ.sha256,
    source:{byteLength:bytes.length,sha256:hashBytes(bytes)},parser:identity,
    syntax:{root:normalized.tree,nodeCount:normalized.nodeCount,errorCount:normalized.errors.length,errors:normalized.errors,treeSha256:treeDigest},
    truth:{sourceBytesNotStored:true,parsePassIsNotSemanticCorrectness:true,errorNodesAreNotPass:true,adapterExecutionIsLocalCallerBound:true,aiRequired:false,networkRequired:false},
    authority:AUTHORITY,
  };
  return Object.freeze({...core,syntaxPassportSha256:hash(core)});
}

module.exports={MAX_NODES,MAX_DEPTH,AUTHORITY,adapterIdentity,normalizeTree,parse,sourceBuffer,canon,hash,hashBytes};
