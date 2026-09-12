'use strict';

const path=require('path');

function blank(){return{parsers:{},structures:{},semantics:{},intentRenderers:{},verifiers:{},deepAnalysis:{}};}
function normalizePack(raw){const p=blank();if(!raw)return p;for(const k of Object.keys(p)){const v=raw[k];if(v==null)continue;if(typeof v!=='object'||Array.isArray(v))throw Error(`ADAPTER_PACK_SECTION_INVALID:${k}`);p[k]={...v};}return p;}
function loadPack(modulePath){if(!modulePath)return{path:null,pack:blank()};const resolved=path.resolve(String(modulePath));const raw=require(resolved);return{path:resolved,pack:normalizePack(raw)};}
function forLanguage(pack,section,languageId){return pack?.[section]?.[languageId]||null;}
function list(pack){const out={};for(const section of Object.keys(blank()))out[section]=Object.keys(pack?.[section]||{}).sort();return out;}
module.exports={blank,normalizePack,loadPack,forLanguage,list};
