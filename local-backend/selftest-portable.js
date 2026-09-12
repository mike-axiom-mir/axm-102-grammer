'use strict';

const assert=require('assert');
const adapters=require('./adapter-host.js');
const {createCore}=require('./core.js');
const strictPack=require('./adapters/strict-portable-pack.js');

function ranges(node,limit){assert(Number.isInteger(node.startByte)&&Number.isInteger(node.endByte));assert(node.startByte>=0&&node.endByte>=node.startByte&&node.endByte<=limit);for(const c of node.children||[])ranges(c,limit);}

const empty=createCore(adapters.blank());
assert.strictEqual(empty.handle({op:'health'}).languageCount,102);
assert.strictEqual(empty.handle({op:'detect',input:{filePath:'src/main.py'}}).organ.languageId,'python');
assert.strictEqual(empty.handle({op:'capability',input:{languageId:'python'}}).level,'G0_IDENTITY');
assert.strictEqual(empty.handle({op:'parse',input:{languageId:'python',source:'x=1\n'}}).result,'PARSER_ADAPTER_NOT_BOUND');

const core=createCore(strictPack);
assert.strictEqual(core.handle({op:'capability',input:{languageId:'json'}}).level,'G5_VERIFIED_REWRITE');

const source='{"hello":[1,true,null],"nested":{"x":"€🙂"}}';
const analyzed=core.handle({op:'analyze',input:{languageId:'json',source}});
assert.strictEqual(analyzed.result,'SEMANTIC_ANALYSIS_READY');
assert.strictEqual(analyzed.syntax.result,'PARSED');
assert.strictEqual(analyzed.syntax.source.byteLength,Buffer.byteLength(source));
ranges(analyzed.syntax.syntax.root,Buffer.byteLength(source));
assert(analyzed.structure.factCount>=4);
assert(analyzed.semanticGraph.nodeCount>=7);
assert(analyzed.semanticGraph.nodes.some(n=>n.symbol==='/nested/x'));

const project=core.handle({op:'project-graph',input:{graphs:[analyzed.semanticGraph]}});
assert.strictEqual(project.result,'PROJECT_GRAPH_READY');
const rootNode=project.nodes.find(n=>n.symbol==='');
assert(rootNode);
const impact=core.handle({op:'project-impact',input:{graph:project,nodeId:rootNode.nodeId,directions:['out']}});
assert.strictEqual(impact.result,'IMPACT_READY');
assert(impact.reachedNodeCount>1);

for(const bad of ['{"x":]','{"x":1,}','[1,]','{"x":"bad\\q"}']){
  const p=core.handle({op:'parse',input:{languageId:'json',source:bad}});
  assert.strictEqual(p.result,'PARSED_WITH_ERRORS');
  assert(p.syntax.errorCount>0);
}

const invalidUtf8=Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d]).toString('base64');
const invalid=core.handle({op:'parse',input:{languageId:'json',sourceBase64:invalidUtf8}});
assert.strictEqual(invalid.result,'PARSED_WITH_ERRORS');

const rendered=core.handle({op:'render',input:{source:'a€c',edits:[{startByte:1,endByte:4,replacement:'Z'}]}});
assert.strictEqual(Buffer.from(rendered.outputBase64,'base64').toString('utf8'),'aZc');

const rewriteSource='{"x":1,"emoji":"🙂"}';
const before=core.handle({op:'analyze',input:{languageId:'json',source:rewriteSource}});
const target=before.semanticGraph.nodes.find(n=>n.symbol==='/x');
assert(target);
const intent=core.handle({op:'keyboard-press',input:{languageId:'json',keyId:'K38',targetRef:target.nodeId,arguments:{replacementJson:'42'}}});
assert.strictEqual(intent.result,'EDIT_INTENT_READY');
const rewrite=core.handle({op:'intent-render-verify',input:{languageId:'json',source:rewriteSource,intent}});
assert.strictEqual(rewrite.result,'VERIFIED_CANDIDATE');
assert.strictEqual(Buffer.from(rewrite.render.candidate.outputBase64,'base64').toString('utf8'),'{"x":42,"emoji":"🙂"}');
assert.strictEqual(rewrite.verification.result,'VERIFIED_CANDIDATE');

const passport=core.handle({op:'evidence-passport',input:{languageId:'json',sourceSha256:before.syntax.source.sha256,syntaxPassport:before.syntax,structuralReport:before.structure,semanticGraph:before.semanticGraph,intentRenderReport:rewrite.render,verificationReport:rewrite.verification,notes:['portable selftest']}});
assert.strictEqual(passport.result,'EVIDENCE_READY');

const atlas=core.handle({op:'bridge-build',input:{bridges:[{fromLanguage:'json',toLanguage:'typescript',relation:'DATA_SHAPE',fromConcept:'JSON object shape',toConcept:'TypeScript structural type',evidenceKind:'SELFTEST'}]}});
assert.strictEqual(atlas.result,'BRIDGE_ATLAS_READY');
assert.strictEqual(core.handle({op:'bridge-query',input:{atlas,languageId:'json'}}).matches.length,1);

const ambiguous=core.handle({op:'detect-assisted',input:{filePath:'analysis.m',source:'x = 1'}});
assert.strictEqual(ambiguous.result,'SELECTION_REQUIRED');

console.log(JSON.stringify({ok:true,languageCount:102,defaultCapability:'G0_IDENTITY',jsonCapability:'G5_VERIFIED_REWRITE',utf8ByteRanges:true,invalidUtf8Held:true,semanticGraph:true,projectImpact:true,verifiedIntentRewrite:true,evidencePassport:true,grammarBridge:true,ambiguousDetectionHeld:true,aiRequired:false,networkRequired:false},null,2));
