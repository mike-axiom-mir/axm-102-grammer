'use strict';

const crypto=require('crypto');
const registry=require('./registry.js');
const levels=require('./capability-levels.js');

const AUTHORITY=Object.freeze({workspaceRead:false,workspaceMutation:false,toolExecution:false,network:false,install:false,promotion:false,canon:false});

function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(canon).join(',')}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;}
function hash(v){return crypto.createHash('sha256').update(typeof v==='string'?v:canon(v)).digest('hex');}
function cleanText(v){return v==null?null:String(v);}
function adapterIdentity(a){
  if(!a)return null;
  const body={
    id:cleanText(a.id),
    kind:cleanText(a.kind),
    provider:cleanText(a.provider),
    implementation:cleanText(a.implementation),
    version:cleanText(a.version),
    artifactSha256:cleanText(a.artifactSha256),
    languageVersion:cleanText(a.languageVersion),
    offlineReady:a.offlineReady===true,
    deterministic:a.deterministic===true,
  };
  return Object.freeze({...body,adapterSha256:hash(body)});
}
function validateAdapter(a,name){
  if(a==null)return null;
  if(typeof a!=='object'||Array.isArray(a))throw Error(`CAPABILITY_ADAPTER_INVALID:${name}`);
  const out=adapterIdentity(a);
  if(!out.id||!out.kind||!out.implementation)throw Error(`CAPABILITY_ADAPTER_IDENTITY_MISSING:${name}`);
  if(out.deterministic!==true)throw Error(`CAPABILITY_ADAPTER_NOT_DETERMINISTIC:${name}`);
  if(out.offlineReady!==true)throw Error(`CAPABILITY_ADAPTER_NOT_OFFLINE_READY:${name}`);
  return out;
}
function measure({languageId,parser=null,structure=null,semantics=null,renderer=null,verifiers=[],deepAnalysis=null}={}){
  const organ=registry.getByLanguageId(languageId);
  if(!organ)return Object.freeze({schema:'axm.code.language-capability-passport.v1',result:'UNKNOWN_LANGUAGE',languageId:languageId||null,authority:'NONE'});
  const adapters={
    parser:validateAdapter(parser,'parser'),
    structure:validateAdapter(structure,'structure'),
    semantics:validateAdapter(semantics,'semantics'),
    renderer:validateAdapter(renderer,'renderer'),
    deepAnalysis:validateAdapter(deepAnalysis,'deepAnalysis'),
    verifiers:Array.isArray(verifiers)?verifiers.map((v,i)=>validateAdapter(v,`verifier:${i}`)).filter(Boolean):[],
  };
  const flags={
    identity:true,
    syntax:!!adapters.parser,
    structure:!!adapters.parser&&!!adapters.structure,
    semantics:!!adapters.parser&&!!adapters.structure&&!!adapters.semantics,
    rewrite:!!adapters.parser&&!!adapters.structure&&!!adapters.renderer,
    verifiedRewrite:!!adapters.parser&&!!adapters.structure&&!!adapters.renderer&&adapters.verifiers.length>0,
    deepAnalysis:!!adapters.parser&&!!adapters.structure&&!!adapters.deepAnalysis,
  };
  const highestLevel=levels.highest(flags)||'G0_IDENTITY';
  const body={
    schema:'axm.code.language-capability-passport.v1',version:'1.0.0',result:'CAPABILITY_MEASURED',languageId:organ.languageId,organId:organ.organId,organDigest:organ.sha256,
    level:highestLevel,flags,adapters,
    truth:{toolNameIsNotCapability:true,adapterPresenceMustBeMeasured:true,unknownIsNotPass:true,offlineByDefault:true,aiRequired:false,networkRequired:false},
    authority:AUTHORITY,
  };
  return Object.freeze({...body,passportSha256:hash(body)});
}
function baseline(languageId){return measure({languageId});}
function allBaseline(){return Object.freeze(registry.all().map(o=>baseline(o.languageId)));}
function snapshot(passports=allBaseline()){
  if(!Array.isArray(passports))throw Error('CAPABILITY_PASSPORTS_NOT_ARRAY');
  const entries=passports.map(p=>({languageId:p.languageId,level:p.level,passportSha256:p.passportSha256||null}));
  const counts=Object.fromEntries(levels.LEVELS.map(l=>[l,entries.filter(x=>x.level===l).length]));
  const body={schema:'axm.code.language-capability-snapshot.v1',version:'1.0.0',count:entries.length,counts,entries,authority:'NONE'};
  return Object.freeze({...body,snapshotSha256:hash(body)});
}

module.exports={AUTHORITY,adapterIdentity,measure,baseline,allBaseline,snapshot};
