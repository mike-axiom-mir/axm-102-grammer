'use strict';

const {TextDecoder}=require('util');

function parseJsonBytes(buffer){
  try{new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch(e){return{root:{type:'document',startByte:0,endByte:buffer.length,children:[{type:'ERROR',startByte:0,endByte:buffer.length,error:true,attributes:{message:'INVALID_UTF8'},children:[]}]}};}
  let i=0;
  const b=n=>buffer[n];
  const isDigit=x=>x>=0x30&&x<=0x39;
  const isHex=x=>isDigit(x)||(x>=0x41&&x<=0x46)||(x>=0x61&&x<=0x66);
  const node=(type,startByte,endByte,children=[],extra={})=>({type,startByte,endByte,children,...extra});
  function ws(){while(i<buffer.length&&(b(i)===0x20||b(i)===0x09||b(i)===0x0a||b(i)===0x0d))i++;}
  function err(msg){const e=new Error(`${msg}@${i}`);e.offset=i;throw e;}
  function string(){const start=i;if(b(i++)!==0x22)err('STRING_EXPECTED');while(i<buffer.length){const c=b(i++);if(c===0x22)return node('string',start,i);if(c===0x5c){if(i>=buffer.length)err('ESCAPE_EOF');const e=b(i++);if(e===0x75){for(let n=0;n<4;n++){if(!isHex(b(i)))err('UNICODE_ESCAPE_INVALID');i++;}}else if(![0x22,0x5c,0x2f,0x62,0x66,0x6e,0x72,0x74].includes(e))err('ESCAPE_INVALID');}else if(c<0x20)err('STRING_CONTROL_CHAR');}err('STRING_EOF');}
  function number(){const start=i;if(b(i)===0x2d)i++;if(b(i)===0x30)i++;else{if(!(b(i)>=0x31&&b(i)<=0x39))err('NUMBER_INVALID');while(isDigit(b(i)))i++;}if(b(i)===0x2e){i++;if(!isDigit(b(i)))err('NUMBER_FRACTION_INVALID');while(isDigit(b(i)))i++;}if(b(i)===0x65||b(i)===0x45){i++;if(b(i)===0x2b||b(i)===0x2d)i++;if(!isDigit(b(i)))err('NUMBER_EXPONENT_INVALID');while(isDigit(b(i)))i++;}return node('number',start,i);}
  function literal(bytes,type){const start=i;for(const x of bytes){if(b(i++)!==x)err(`${type.toUpperCase()}_INVALID`);}return node(type,start,i);}
  function value(fieldName=null){ws();let n;const c=b(i);if(c===0x22)n=string();else if(c===0x7b)n=object();else if(c===0x5b)n=array();else if(c===0x74)n=literal([0x74,0x72,0x75,0x65],'true');else if(c===0x66)n=literal([0x66,0x61,0x6c,0x73,0x65],'false');else if(c===0x6e)n=literal([0x6e,0x75,0x6c,0x6c],'null');else if(c===0x2d||isDigit(c))n=number();else err('VALUE_EXPECTED');if(fieldName)n.fieldName=fieldName;return n;}
  function member(){ws();const start=i,key=string();ws();if(b(i++)!==0x3a)err('COLON_EXPECTED');const val=value('value');return node('pair',start,i,[{...key,fieldName:'key'},val]);}
  function object(){const start=i;i++;ws();const children=[];if(b(i)===0x7d){i++;return node('object',start,i,children);}while(true){children.push(member());ws();if(b(i)===0x2c){i++;ws();continue;}if(b(i)===0x7d){i++;break;}err('OBJECT_DELIMITER_EXPECTED');}return node('object',start,i,children);}
  function array(){const start=i;i++;ws();const children=[];if(b(i)===0x5d){i++;return node('array',start,i,children);}while(true){children.push(value('element'));ws();if(b(i)===0x2c){i++;ws();continue;}if(b(i)===0x5d){i++;break;}err('ARRAY_DELIMITER_EXPECTED');}return node('array',start,i,children);}
  try{ws();const child=value('documentValue');ws();if(i!==buffer.length)err('TRAILING_CONTENT');return{root:node('document',0,buffer.length,[child])};}catch(e){const p=Math.max(0,Math.min(buffer.length,Number(e.offset)||0));return{root:node('document',0,buffer.length,[node('ERROR',p,Math.min(buffer.length,p+1),[],{error:true,attributes:{message:String(e.message||e)}})])};}
}

const parser={id:'axm.builtin.json.strict-byte-parser.v1',kind:'parser',implementation:'pure-js-json-recursive-descent-utf8-bytes',version:'1.0.0',artifactSha256:'SOURCE_BOUND_AT_REPOSITORY_COMMIT',deterministic:true,offlineReady:true,languages:['json'],parse:({source})=>parseJsonBytes(source)};
const structure={id:'axm.builtin.json.strict-structure.v1',kind:'structure',implementation:'json-tree-structural-facts',version:'1.0.0',artifactSha256:'SOURCE_BOUND_AT_REPOSITORY_COMMIT',deterministic:true,offlineReady:true,languages:['json'],acceptsParseErrors:false,extract:({syntaxPassport})=>{const out=[];function walk(n,parent=null){if(n.type==='object'||n.type==='array'||n.type==='pair'){const factId=`json-${out.length+1}`;out.push({factId,kind:n.type==='pair'?'MEMBER':n.type.toUpperCase(),nativeType:n.type,startByte:n.startByte,endByte:n.endByte,parentFactId:parent,role:n.fieldName||null});parent=factId;}for(const c of n.children||[])walk(c,parent);}walk(syntaxPassport.syntax.root);return{facts:out};}};
module.exports={parser,structure,parseJsonBytes};
