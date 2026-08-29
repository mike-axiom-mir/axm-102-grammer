'use strict';

const crypto=require('crypto');
const parser=require('./parser-spine.js');

const AUTHORITY=Object.freeze({workspaceRead:false,workspaceMutation:false,toolExecution:false,network:false,install:false,promotion:false,canon:false});
const MAX_FACTS=250000;

function canon(v){return parser.canon(v);}
function hash(v){return crypto.createHash('sha256').update(typeof v==='string'?v:canon(v)).digest('hex');}
function adapterIdentity(adapter){
  if(!adapter||typeof adapter!=='object'||Array.isArray(adapter))throw Error('STRUCTURE_ADAPTER_INVALID');
  const body={id:String(adapter.id||''),kind:String(adapter.kind||'structure'),implementation:String(adapter.implementation||''),version:String(adapter.version||'UNKNOWN'),artifactSha256:String(adapter.artifactSha256||'UNBOUND'),deterministic:adapter.deterministic===true,offlineReady:adapter.offlineReady===true,languages:Array.isArray(adapter.languages)?[...new Set(adapter.languages.map(String))].sort():[],acceptsParseErrors:adapter.acceptsParseErrors===true};
  if(!body.id||!body.implementation)throw Error('STRUCTURE_ADAPTER_IDENTITY_MISSING');
  if(!body.deterministic)throw Error('STRUCTURE_ADAPTER_NOT_DETERMINISTIC');
  if(!body.offlineReady)throw Error('STRUCTURE_ADAPTER_NOT_OFFLINE_READY');
  if(typeof adapter.extract!=='function')throw Error('STRUCTURE_ADAPTER_EXTRACT_MISSING');
  return Object.freeze({...body,adapterSha256:hash(body)});
}
function scalarObject(v,label){
  if(v==null)return null;
  if(typeof v!=='object'||Array.isArray(v))throw Error(`${label}_INVALID`);
  const out={};for(const [k,x] of Object.entries(v)){if(!/^[A-Za-z0-9_.:-]{1,80}$/.test(k))throw Error(`${label}_KEY_INVALID`);if(x===null||['string','number','boolean'].includes(typeof x))out[k]=x;else throw Error(`${label}_VALUE_INVALID:${k}`);}return out;
}
function normalizeFact(raw,index,sourceLength,languageId){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error(`STRUCTURE_FACT_INVALID:${index}`);
  const kind=String(raw.kind||''),nativeType=String(raw.nativeType||'');
  const startByte=Number(raw.startByte),endByte=Number(raw.endByte);
  if(!kind||!nativeType)throw Error(`STRUCTURE_FACT_IDENTITY_MISSING:${index}`);
  if(!Number.isInteger(startByte)||!Number.isInteger(endByte)||startByte<0||endByte<startByte||endByte>sourceLength)throw Error(`STRUCTURE_FACT_RANGE_INVALID:${index}`);
  const base={kind,nativeType,startByte,endByte,name:raw.name==null?null:String(raw.name),role:raw.role==null?null:String(raw.role),parentFactId:raw.parentFactId==null?null:String(raw.parentFactId),attributes:scalarObject(raw.attributes,'STRUCTURE_FACT_ATTRIBUTES')};
  const factId=raw.factId?String(raw.factId):`sf.${languageId}.${hash({...base,index}).slice(0,24)}`;
  return Object.freeze({factId,...base,factSha256:hash({factId,...base})});
}
function extract({source,syntaxPassport,adapter}={}){
  const bytes=parser.sourceBuffer(source);
  if(!syntaxPassport||syntaxPassport.schema!=='axm.code.syntax-passport.v1')throw Error('STRUCTURE_SYNTAX_PASSPORT_REQUIRED');
  if(parser.hashBytes(bytes)!==syntaxPassport.source?.sha256)throw Error('STRUCTURE_SOURCE_DIGEST_MISMATCH');
  const identity=adapterIdentity(adapter);
  if(identity.languages.length&&!identity.languages.includes(syntaxPassport.languageId))return Object.freeze({schema:'axm.code.structural-fact-report.v1',result:'STRUCTURE_LANGUAGE_UNSUPPORTED',languageId:syntaxPassport.languageId,adapter:identity,authority:'NONE'});
  if(syntaxPassport.result==='PARSED_WITH_ERRORS'&&!identity.acceptsParseErrors)return Object.freeze({schema:'axm.code.structural-fact-report.v1',result:'STRUCTURE_HELD_PARSE_ERRORS',languageId:syntaxPassport.languageId,syntaxPassportSha256:syntaxPassport.syntaxPassportSha256,adapter:identity,authority:'NONE'});
  const raw=adapter.extract({languageId:syntaxPassport.languageId,source:Buffer.from(bytes),syntaxPassport});
  if(raw&&typeof raw.then==='function')throw Error('ASYNC_STRUCTURE_ADAPTER_NOT_ALLOWED');
  const xs=Array.isArray(raw)?raw:Array.isArray(raw?.facts)?raw.facts:null;
  if(!xs)throw Error('STRUCTURE_FACT_ARRAY_MISSING');
  if(xs.length>MAX_FACTS)throw Error('STRUCTURE_FACT_LIMIT');
  const facts=xs.map((x,i)=>normalizeFact(x,i,bytes.length,syntaxPassport.languageId));
  if(new Set(facts.map(x=>x.factId)).size!==facts.length)throw Error('STRUCTURE_FACT_ID_DUPLICATE');
  const ids=new Set(facts.map(x=>x.factId));for(const f of facts)if(f.parentFactId&&!ids.has(f.parentFactId))throw Error(`STRUCTURE_PARENT_UNKNOWN:${f.factId}`);
  const core={schema:'axm.code.structural-fact-report.v1',version:'1.0.0',result:'STRUCTURE_FACTS_READY',languageId:syntaxPassport.languageId,organId:syntaxPassport.organId,sourceSha256:syntaxPassport.source.sha256,syntaxPassportSha256:syntaxPassport.syntaxPassportSha256,adapter:identity,factCount:facts.length,facts,truth:{factsAreObservedByBoundAdapter:true,factsAreNotSemanticCorrectness:true,sourceBytesNotStored:true,aiRequired:false,networkRequired:false},authority:AUTHORITY};
  return Object.freeze({...core,reportSha256:hash(core)});
}

module.exports={MAX_FACTS,AUTHORITY,adapterIdentity,extract};
