'use strict';

const LEVELS=Object.freeze([
  'G0_IDENTITY',
  'G1_SYNTAX',
  'G2_STRUCTURE',
  'G3_SEMANTICS',
  'G4_REWRITE',
  'G5_VERIFIED_REWRITE',
  'G6_DEEP_ANALYSIS',
]);

const ORDER=Object.freeze(Object.fromEntries(LEVELS.map((x,i)=>[x,i])));

function isLevel(v){return Object.prototype.hasOwnProperty.call(ORDER,String(v||''));}
function atLeast(actual,required){return isLevel(actual)&&isLevel(required)&&ORDER[actual]>=ORDER[required];}
function highest(flags={}){
  const earned={
    G0_IDENTITY:flags.identity===true,
    G1_SYNTAX:flags.syntax===true,
    G2_STRUCTURE:flags.structure===true,
    G3_SEMANTICS:flags.semantics===true,
    G4_REWRITE:flags.rewrite===true,
    G5_VERIFIED_REWRITE:flags.verifiedRewrite===true,
    G6_DEEP_ANALYSIS:flags.deepAnalysis===true,
  };
  let level=null;
  for(const candidate of LEVELS){
    if(!earned[candidate])break;
    level=candidate;
  }
  return level;
}

module.exports={LEVELS,ORDER,isLevel,atLeast,highest};
