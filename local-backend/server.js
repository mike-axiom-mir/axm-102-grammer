#!/usr/bin/env node
'use strict';

const http=require('http');
const host=require('./adapter-host.js');
const {createCore}=require('./core.js');

function argValue(name,fallback=null){const i=process.argv.indexOf(name);return i>=0&&i+1<process.argv.length?process.argv[i+1]:fallback;}
const bindHost=argValue('--host',process.env.AXM_GRAMMAR_HOST||'127.0.0.1');
const port=Number(argValue('--port',process.env.AXM_GRAMMAR_PORT||8172));
const packPath=argValue('--adapter-pack',process.env.AXM_GRAMMAR_ADAPTER_PACK||null);
const cors=process.argv.includes('--cors');
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT_INVALID');
const loaded=host.loadPack(packPath);
const core=createCore(loaded.pack);
const MAX_BODY=70*1024*1024;

function send(res,status,obj){const body=Buffer.from(JSON.stringify(obj));res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('content-length',String(body.length));res.setHeader('cache-control','no-store');if(cors)res.setHeader('access-control-allow-origin','*');res.end(body);}
function requestObject(req,cb){let n=0,chunks=[];req.on('data',c=>{n+=c.length;if(n>MAX_BODY){req.destroy(Error('REQUEST_TOO_LARGE'));return;}chunks.push(c);});req.on('end',()=>{try{const text=Buffer.concat(chunks).toString('utf8');cb(null,text?JSON.parse(text):{});}catch(e){cb(e);}});req.on('error',cb);}

const server=http.createServer((req,res)=>{
  if(cors&&req.method==='OPTIONS'){res.statusCode=204;res.setHeader('access-control-allow-origin','*');res.setHeader('access-control-allow-methods','GET,POST,OPTIONS');res.setHeader('access-control-allow-headers','content-type');res.end();return;}
  if(req.method==='GET'&&req.url==='/health'){try{return send(res,200,{ok:true,response:core.handle({op:'health'})});}catch(e){return send(res,500,{ok:false,error:{message:String(e.message||e)}});}}
  if(req.method==='GET'&&req.url==='/languages'){try{return send(res,200,{ok:true,response:core.handle({op:'languages'})});}catch(e){return send(res,500,{ok:false,error:{message:String(e.message||e)}});}}
  if(req.method!=='POST'||req.url!=='/v1')return send(res,404,{ok:false,error:{message:'NOT_FOUND'}});
  requestObject(req,(err,body)=>{if(err)return send(res,400,{ok:false,error:{message:err.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'REQUEST_JSON_INVALID'}});try{return send(res,200,{ok:true,response:core.handle(body)});}catch(e){return send(res,400,{ok:false,error:{name:e?.name||'Error',message:String(e?.message||e)}});}});
});
server.on('error',err=>{process.stderr.write(`AXM_GRAMMAR_SERVER_ERROR ${err.message}\n`);process.exitCode=1;});
server.listen(port,bindHost,()=>{process.stdout.write(JSON.stringify({schema:'axm.code.local-backend-start.v1',result:'LISTENING',host:bindHost,port,adapterPack:loaded.path,offlineDefault:true,aiRequired:false,networkDependency:false})+'\n');});
