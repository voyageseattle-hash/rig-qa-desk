import {inspectCharacter,inventory} from './engine.mjs';
import {LIMITS,QualityError,ensure} from './glb.mjs';
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function runLocalJob(job){
 ensure(job&&['inventory','inspect'].includes(job.mode)&&job.primary instanceof ArrayBuffer,'JOB_SHAPE','Invalid local inspection job.');
 ensure(job.primary.byteLength<=LIMITS.bytes&&(!job.secondary||job.secondary instanceof ArrayBuffer&&job.secondary.byteLength<=LIMITS.bytes),'ASSET_LIMIT','Use GLB files no larger than 32 MiB each.');
 const primaryHash=await digest(job.primary),otherHash=job.secondary?await digest(job.secondary):undefined;
 if(job.mode==='inspect'&&job.profile!==undefined)ensure(job.profile!==null&&typeof job.profile==='object'&&!Array.isArray(job.profile),'PROFILE_SHAPE','Character allowances must be a JSON object.');
 const meta=inventory(job.primary);meta.suggested_profile.asset_sha256=primaryHash;
 if(job.mode==='inventory')return {...meta,asset_sha256:primaryHash};
 if(job.profile?.asset_sha256)ensure(job.profile.asset_sha256===primaryHash,'PROFILE_IDENTITY','These allowances belong to a different character file. Prepare or review a new profile.');
 if(job.profile?.other_asset_sha256)ensure(job.profile.other_asset_sha256===otherHash,'PROFILE_IDENTITY','These contact allowances belong to a different counterpart file.');
 const report=inspectCharacter(job.primary,{...(job.profile??meta.suggested_profile),asset_sha256:primaryHash,...(otherHash?{other_asset_sha256:otherHash}:{})},job.secondary);
 report.asset_sha256=primaryHash;if(otherHash)report.other_asset_sha256=otherHash;
 report.profile_sha256=await digest(new TextEncoder().encode(canonical(report.profile)));
 report.report_hash_basis='canonical JSON excluding report_sha256';
 report.report_sha256=await digest(new TextEncoder().encode(canonical(report)));
 return {report,inventory:meta};
}
if(typeof self!=='undefined'&&typeof document==='undefined')self.onmessage=async({data})=>{
 try{self.postMessage({ok:true,value:await runLocalJob(data)});}catch(error){self.postMessage({ok:false,code:error instanceof QualityError?error.code:'EVALUATION_FAILED',message:error instanceof QualityError?error.message:'Evaluation could not complete. No successful check result was recorded.'});}
};
