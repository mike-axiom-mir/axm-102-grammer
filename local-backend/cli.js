#!/usr/bin/env node
'use strict';

const readline=require('readline');
const host=require('./adapter-host.js');
const {createCore}=require('./core.js');

function argValue(name){const i=process.argv.indexOf(name);return i>=0&&i+1<process.argv.length?process.argv[i+1]:null;}
const packPath=argValue('--adapter-pack')||process.env.AXM_GRAMMAR_ADAPTER_PACK||null;
const loaded=host.loadPack(packPath);
const core=createCore(loaded.pack);

function reply(req){try{return{ok:true,response:core.handle(req)}}catch(err){return{ok:false,error:{name:err?.name||'Error',message:String(err?.message||err)}}}}

if(process.argv.includes('--health')){
  process.stdout.write(JSON.stringify(reply({op:'health'}))+'\n');
  process.exit(0);
}

const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
rl.on('line',line=>{
  if(!line.trim())return;
  let req;
  try{req=JSON.parse(line);}catch(err){process.stdout.write(JSON.stringify({ok:false,error:{name:'SyntaxError',message:'REQUEST_JSON_INVALID'}})+'\n');return;}
  process.stdout.write(JSON.stringify(reply(req))+'\n');
});
