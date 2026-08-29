'use strict';

const registry=require('../language-organs/registry.js');
const grammar=require('../language-organs/grammar-profile-registry.js');
const eyes=require('../language-organs/specialist-eye-registry.js');
const discovery=require('../language-organs/code-native-discovery-seam.js');
const keyboard=require('../language-organs/machine-code-keyboard-router.js');
const capability=require('../language-organs/capability-passport.js');
const parser=require('../language-organs/parser-spine.js');
const structure=require('../language-organs/structural-facts.js');
const semantic=require('../language-organs/semantic-graph.js');
const deep=require('../language-organs/deep-analysis.js');
const project=require('../language-organs/project-graph.js');
const renderer=require('../language-organs/candidate-renderer.js');
const intentRenderer=require('../language-organs/intent-renderer.js');
const verifier=require('../language-organs/verifier-ladder.js');
const evidence=require('../language-organs/evidence-passport.js');
const assistedDetection=require('../language-organs/parser-assisted-detection.js');
const bridges=require('../language-organs/grammar-bridge-atlas.js');
const adapters=require('./adapter-host.js');

const API_VERSION='1.2.0';
const MAX_SOURCE_BYTES=64*1024*1024;

function sourceBytes(input={}){
  if(input.sourceBase64!=null){const b=Buffer.from(String(input.sourceBase64),'base64');if(b.length>MAX_SOURCE_BYTES)throw Error('SOURCE_TOO_LARGE');return b;}
  if(input.source!=null){const b=Buffer.from(String(input.source),'utf8');if(b.length>MAX_SOURCE_BYTES)throw Error('SOURCE_TOO_LARGE');return b;}
  throw Error('SOURCE_REQUIRED');
}
function jsonCandidate(c){if(!c||!Buffer.isBuffer(c.outputBytes))return c;const out={...c,outputBase64:c.outputBytes.toString('base64')};delete out.outputBytes;return out;}
function jsonRenderReport(r){if(!r||!r.candidate)return r;return{...r,candidate:jsonCandidate(r.candidate)};}
function bound(pack,section,languageId){return adapters.forLanguage(pack,section,languageId);}
function measured(pack,languageId){return capability.measure({languageId,parser:bound(pack,'parsers',languageId),structure:bound(pack,'structures',languageId),semantics:bound(pack,'semantics',languageId),renderer:bound(pack,'intentRenderers',languageId),verifiers:bound(pack,'verifiers',languageId)||[],deepAnalysis:bound(pack,'deepAnalysis',languageId)});}
function localAnalysis(pack,languageId,source){
  const pa=bound(pack,'parsers',languageId),sa=bound(pack,'structures',languageId),ma=bound(pack,'semantics',languageId),cap=measured(pack,languageId);
  if(!pa)return{schema:'axm.code.local-analysis.v1',result:'PARSER_ADAPTER_NOT_BOUND',languageId,capability:cap};
  const syntax=parser.parse({languageId,source,adapter:pa});
  let structural=null,semanticGraph=null;
  if(sa)structural=structure.extract({source,syntaxPassport:syntax,adapter:sa});
  if(ma&&syntax.result==='PARSED')semanticGraph=semantic.build({source,syntaxPassport:syntax,structuralReport:structural?.result==='STRUCTURE_FACTS_READY'?structural:null,adapter:ma});
  const result=semanticGraph?'SEMANTIC_ANALYSIS_READY':structural?.result==='STRUCTURE_FACTS_READY'?'ANALYSIS_READY':'SYNTAX_READY_DEEPER_LAYERS_HELD';
  return{schema:'axm.code.local-analysis.v1',result,languageId,capability:cap,syntax,structure:structural,semanticGraph};
}
function createCore(pack=adapters.blank()){
  function handle(request={}){
    if(!request||typeof request!=='object'||Array.isArray(request))throw Error('REQUEST_NOT_OBJECT');
    const op=String(request.op||''),input=request.input&&typeof request.input==='object'&&!Array.isArray(request.input)?request.input:{};
    if(op==='health')return{schema:'axm.code.local-backend-health.v1',result:'READY',apiVersion:API_VERSION,languageCount:registry.all().length,adapters:adapters.list(pack),operations:['health','languages','language','detect','detect-assisted','grammar-plan','eye-plan','discover','keyboard-layout','keyboard-press','keyboard-program','capability','parse','structure','semantic','analyze','deep-analysis','project-graph','project-impact','render','intent-render','render-verify','intent-render-verify','evidence-passport','bridge-build','bridge-query'],truth:{offlineDefault:true,aiRequired:false,networkRequired:false,workspaceMutation:false}};
    if(op==='languages')return{schema:'axm.code.local-backend-languages.v1',result:'READY',languages:registry.all().map(o=>({languageId:o.languageId,organId:o.organId,displayName:o.displayName,family:o.family,kind:o.kind,capability:measured(pack,o.languageId).level}))};
    if(op==='language'){
      const o=registry.getByLanguageId(String(input.languageId||''));if(!o)return{result:'UNKNOWN_LANGUAGE',languageId:input.languageId||null};
      return{schema:'axm.code.local-backend-language.v1',result:'READY',organ:o,grammar:grammar.getByLanguageId(o.languageId),eye:eyes.getByLanguageId(o.languageId),capability:measured(pack,o.languageId)};
    }
    if(op==='detect')return registry.detect(input);
    if(op==='detect-assisted')return assistedDetection.resolve({filePath:input.filePath||'',firstLine:input.firstLine||'',preferredOrganId:input.preferredOrganId||null,source:sourceBytes(input),parserForLanguage:languageId=>bound(pack,'parsers',languageId)});
    if(op==='grammar-plan')return grammar.plan(input);
    if(op==='eye-plan')return eyes.plan(input);
    if(op==='discover')return discovery.review(input);
    if(op==='keyboard-layout')return keyboard.layout(input);
    if(op==='keyboard-press')return keyboard.press(input);
    if(op==='keyboard-program')return keyboard.program(input);
    if(op==='capability')return measured(pack,String(input.languageId||''));
    if(op==='parse'){
      const languageId=String(input.languageId||''),a=bound(pack,'parsers',languageId);if(!a)return{schema:'axm.code.syntax-passport.v1',result:'PARSER_ADAPTER_NOT_BOUND',languageId,authority:'NONE'};
      return parser.parse({languageId,source:sourceBytes(input),adapter:a});
    }
    if(op==='structure'){
      const languageId=String(input.languageId||''),pa=bound(pack,'parsers',languageId),sa=bound(pack,'structures',languageId);if(!pa)return{result:'PARSER_ADAPTER_NOT_BOUND',languageId,authority:'NONE'};if(!sa)return{result:'STRUCTURE_ADAPTER_NOT_BOUND',languageId,authority:'NONE'};
      const source=sourceBytes(input),syntax=parser.parse({languageId,source,adapter:pa});return structure.extract({source,syntaxPassport:syntax,adapter:sa});
    }
    if(op==='semantic'){
      const languageId=String(input.languageId||''),source=sourceBytes(input),pa=bound(pack,'parsers',languageId),sa=bound(pack,'structures',languageId),ma=bound(pack,'semantics',languageId);if(!pa)return{result:'PARSER_ADAPTER_NOT_BOUND',languageId,authority:'NONE'};if(!ma)return{result:'SEMANTIC_ADAPTER_NOT_BOUND',languageId,authority:'NONE'};const syntax=parser.parse({languageId,source,adapter:pa});if(syntax.result!=='PARSED')return{result:'SEMANTIC_HELD_PARSE_ERRORS',languageId,syntax,authority:'NONE'};const structural=sa?structure.extract({source,syntaxPassport:syntax,adapter:sa}):null;return semantic.build({source,syntaxPassport:syntax,structuralReport:structural?.result==='STRUCTURE_FACTS_READY'?structural:null,adapter:ma,documentId:input.documentId||'document'});
    }
    if(op==='analyze'){
      const source=sourceBytes(input);let languageId=String(input.languageId||'');if(!languageId){const d=registry.detect({filePath:input.filePath||'',firstLine:input.firstLine||'',preferredOrganId:input.preferredOrganId||null});if(d.result!=='MATCHED')return{schema:'axm.code.local-analysis.v1',result:'LANGUAGE_NOT_RESOLVED',detection:d};languageId=d.organ.languageId;}
      return localAnalysis(pack,languageId,source);
    }
    if(op==='deep-analysis'){
      const languageId=String(input.languageId||''),source=sourceBytes(input),da=bound(pack,'deepAnalysis',languageId);if(!da)return{schema:'axm.code.deep-analysis-report.v1',result:'DEEP_ANALYSIS_ADAPTER_NOT_BOUND',languageId,authority:'NONE'};const analysis=localAnalysis(pack,languageId,source);if(!analysis.syntax||analysis.syntax.result!=='PARSED')return{schema:'axm.code.deep-analysis-report.v1',result:'DEEP_ANALYSIS_HELD_SYNTAX',languageId,analysis,authority:'NONE'};return deep.analyze({languageId,source,syntaxPassport:analysis.syntax,structuralReport:analysis.structure?.result==='STRUCTURE_FACTS_READY'?analysis.structure:null,semanticGraph:analysis.semanticGraph||null,projectGraph:input.projectGraph||null,adapter:da,requestedAnalyses:input.requestedAnalyses||[]});
    }
    if(op==='project-graph')return project.build({graphs:input.graphs||[],crossEdges:input.crossEdges||[]});
    if(op==='project-impact')return project.impact({graph:input.graph,nodeId:input.nodeId,directions:input.directions||['out'],edgeKinds:input.edgeKinds??null,maxDepth:input.maxDepth??8,maxNodes:input.maxNodes??10000});
    if(op==='render')return jsonCandidate(renderer.render({source:sourceBytes(input),sourceSha256:input.sourceSha256||null,edits:input.edits||[]}));
    if(op==='intent-render'||op==='intent-render-verify'){
      const languageId=String(input.languageId||''),source=sourceBytes(input),ra=bound(pack,'intentRenderers',languageId);if(!ra)return{result:'INTENT_RENDERER_NOT_BOUND',languageId,authority:'NONE'};const analysis=localAnalysis(pack,languageId,source);if(!analysis.syntax||analysis.syntax.result!=='PARSED')return{result:'INTENT_RENDER_HELD_SYNTAX',languageId,analysis,authority:'NONE'};const report=intentRenderer.renderIntent({languageId,source,intent:input.intent,syntaxPassport:analysis.syntax,structuralReport:analysis.structure?.result==='STRUCTURE_FACTS_READY'?analysis.structure:null,semanticGraph:analysis.semanticGraph||null,adapter:ra});if(op==='intent-render')return jsonRenderReport(report);if(report.result!=='INTENT_CANDIDATE_READY')return{schema:'axm.code.local-intent-render-verify.v1',result:report.result,render:jsonRenderReport(report)};const verification=verifier.verify({languageId,candidate:report.candidate,parserAdapter:bound(pack,'parsers',languageId),verifiers:bound(pack,'verifiers',languageId)||[]});return{schema:'axm.code.local-intent-render-verify.v1',result:verification.result,render:jsonRenderReport(report),verification};
    }
    if(op==='render-verify'){
      const languageId=String(input.languageId||''),source=sourceBytes(input),candidate=renderer.render({source,sourceSha256:input.sourceSha256||null,edits:input.edits||[]});
      if(candidate.result!=='CANDIDATE_BYTES_READY')return{schema:'axm.code.local-render-verify.v1',result:candidate.result,candidate:jsonCandidate(candidate)};
      const report=verifier.verify({languageId,candidate,parserAdapter:bound(pack,'parsers',languageId),verifiers:bound(pack,'verifiers',languageId)||[]});return{schema:'axm.code.local-render-verify.v1',result:report.result,candidate:jsonCandidate(candidate),verification:report};
    }
    if(op==='evidence-passport')return evidence.create(input);
    if(op==='bridge-build')return bridges.build({bridges:input.bridges||[]});
    if(op==='bridge-query')return{schema:'axm.code.grammar-bridge-query.v1',result:'BRIDGE_QUERY_READY',matches:bridges.query(input.atlas,{languageId:input.languageId||null,relation:input.relation||null}),authority:'NONE'};
    return{schema:'axm.code.local-backend-error.v1',result:'UNKNOWN_OPERATION',op};
  }
  return Object.freeze({API_VERSION,handle});
}
module.exports={API_VERSION,MAX_SOURCE_BYTES,sourceBytes,jsonCandidate,jsonRenderReport,localAnalysis,createCore};
