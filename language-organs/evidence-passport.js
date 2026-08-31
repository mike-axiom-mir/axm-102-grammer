'use strict';

const crypto=require('crypto');
const parser=require('./parser-spine.js');

const AUTHORITY=Object.freeze({workspaceRead:false,workspaceMutation:false,toolExecution:false,network:false,install:false,promotion:false,canon:false});
function hash(v){return crypto.createHash('sha256').update(parser.canon(v)).digest('hex');}
function create({languageId,sourceSha256,syntaxPassport=null,structuralReport=null,semanticGraph=null,projectGraph=null,intentRenderReport=null,verificationReport=null,notes=[]}={}){
  if(!languageId||!sourceSha256)throw Error('EVIDENCE_PASSPORT_IDENTITY_REQUIRED');
  const checks=[];
  function bind(name,obj,digestField,observedSourceSha256=null){
    if(!obj)return null;
    const digest=obj[digestField];
    if(!digest)throw Error(`EVIDENCE_DIGEST_MISSING:${name}`);
    if(observedSourceSha256&&observedSourceSha256!==sourceSha256)throw Error(`EVIDENCE_SOURCE_MISMATCH:${name}`);
    checks.push({name,digest,result:obj.result||null});
    return digest;
  }
  const syntaxPassportSha256=bind('syntax',syntaxPassport,'syntaxPassportSha256',syntaxPassport?.source?.sha256||null);
  const structuralReportSha256=bind('structure',structuralReport,'reportSha256',structuralReport?.sourceSha256||null);
  const semanticGraphSha256=bind('semantic',semanticGraph,'graphSha256',semanticGraph?.sourceSha256||null);
  const projectGraphSha256=projectGraph?.projectGraphSha256||null;
  if(projectGraph&&!projectGraphSha256)throw Error('EVIDENCE_DIGEST_MISSING:projectGraph');
  const renderReportSha256=bind('render',intentRenderReport,'renderReportSha256',intentRenderReport?.sourceSha256||null);
  const verificationSha256=verificationReport?.verificationSha256||null;
  if(verificationReport&&verificationReport.outputSha256&&intentRenderReport?.candidate?.output?.sha256&&verificationReport.outputSha256!==intentRenderReport.candidate.output.sha256)throw Error('EVIDENCE_RENDER_VERIFY_MISMATCH');
  let state='EVIDENCE_READY';
  if(syntaxPassport?.result==='PARSED_WITH_ERRORS'||verificationReport?.result==='CANDIDATE_REJECTED')state='EVIDENCE_FAIL';
  else if(verificationReport&&verificationReport.result!=='VERIFIED_CANDIDATE')state='EVIDENCE_HELD';
  const body={schema:'axm.code.evidence-passport.v1',version:'1.0.0',result:state,languageId:String(languageId),sourceSha256:String(sourceSha256),bindings:{syntaxPassportSha256,structuralReportSha256,semanticGraphSha256,projectGraphSha256,renderReportSha256,verificationSha256},checks,notes:Array.isArray(notes)?notes.map(String):[],truth:{evidenceIsNotAuthority:true,unknownIsNotPass:true,verifiedCandidateIsStillNotWorkspaceMutation:true,aiRequired:false,networkRequired:false},authority:AUTHORITY};
  return Object.freeze({...body,evidencePassportSha256:hash(body)});
}
module.exports={AUTHORITY,create};
