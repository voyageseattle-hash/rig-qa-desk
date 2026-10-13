import {createHash} from 'node:crypto';
import {buildWorkflowFixture} from '../shared/fixtures/workflow.mjs';
import {inspectGlb} from '../shared/src/inspect.mjs';
import {validateInspection,validateAdvice,createMockAdvice,NEBIUS_MODEL} from './provider.mjs';
import {createLedger,readGrant} from './ledger.mjs';
import {resolveJudgeUser} from './gateway.mjs';
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function boundedBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw Error();
 if(Number(request.headers.get('Content-Length'))>64*1024)throw Error();
 const reader=request.body?.getReader();if(!reader)throw Error();let length=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>64*1024){await reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function measured(body){
 if(!['valid','flawed'].includes(body.fixture)||!hex(body.asset_sha256)||!hex(body.report_sha256))throw Error('body_invalid');
 const inspection=validateInspection(inspectGlb(buildWorkflowFixture({flawed:body.fixture==='flawed'}))),report_sha256=sha(inspection);
 if(body.asset_sha256!==inspection.asset_sha256||body.report_sha256!==report_sha256)throw Error('inspection_mismatch');
 return {inspection,report_sha256};
}
function markdown({inspection,report_sha256},fixture){
 const lines=['# Artist investigation handoff','','Hosted owned procedural example: '+fixture,'','## Exact file','',`Asset SHA256: ${inspection.asset_sha256}`,`Report SHA256: ${report_sha256}`,'','Human review: not recorded. Repair approved: false. Original unchanged.','No model request was made to create this handoff.','','## Measured structural findings',''];
 for(const f of inspection.findings){lines.push(`### ${f.id} / ${f.code}`,`Location: ${f.location}`,f.message,'','Evidence:','```json',JSON.stringify(f.evidence,null,2),'```','');
  if(f.code==='JOINT_INDEX_RANGE')lines.push('Investigate source/export skin mapping at the reported vertex and influence. Do not guess a replacement bone. Confirm the intended mapping in authoring data, export a separate copy, and reinspect.','');
  else if(f.code==='ANIMATION_OUTPUT_COUNT')lines.push('Inspect the reported animation target, path, interpolation and input/output accessors in the source/export workflow. Check vector sample counts against timestamps. Do not insert or delete motion values automatically. Export a separate copy and reinspect.','');
  else lines.push('Review the listed evidence in the source workflow. Do not infer an automatic correction.','');
 }
 if(!inspection.findings.length)lines.push('No issue detected by the supported structural checks. This is not an asset correctness certificate.','');
 lines.push('## Scope and recheck','','Official Khronos conformance validation did not run in this hosted guided test. It is available separately in the downloadable Node app. Visual deformation, anatomy, physics, collisions and target-engine behavior remain unverified.','', 'The prepared valid counterpart illustrates reinspection of known corrected authoring data. This service does not edit an asset or perform a repair.','');
 return lines.join('\n');
}
export function createExportHandler({env={},db,localMock=false}={}){
 return async request=>{
  const url=new URL(request.url);
  if(!['/api/qa/handoff','/api/qa/review'].includes(url.pathname))return json({error:'not_found'},404);
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Rig-QA-Request')!=='1')return json({error:'request_origin_denied'},403);
  const userId=url.pathname==='/api/qa/review'?resolveJudgeUser(request,env,localMock):null;
  if(url.pathname==='/api/qa/review'&&!userId)return json({error:'user_not_allowed'},403);
  let body;try{body=await boundedBody(request);}catch{return json({error:'body_invalid'},400);}
  try{
   if(url.pathname==='/api/qa/handoff'){
    if(!exact(body,['fixture','asset_sha256','report_sha256']))throw Error('body_invalid');
    const value=measured(body);return json({filename:`rig-qa-artist-handoff-${body.asset_sha256.slice(0,12)}.md`,markdown:markdown(value,body.fixture),human_review:'not recorded',repair_approved:false,new_provider_requests:0});
   }
   if(!exact(body,['fixture','request_id','asset_sha256','report_sha256','advice','decisions','acknowledged_review_only'])||!uuid(body.request_id)||body.acknowledged_review_only!==true)throw Error('body_invalid');
   const value=measured(body),advice=validateAdvice(value.inspection,body.advice),adviceHash=sha(advice),requestId=body.request_id.toLowerCase();
   if(typeof env.NEBIUS_API_KEY==='string'&&env.NEBIUS_API_KEY.trim()&&JSON.stringify(advice).includes(env.NEBIUS_API_KEY.trim()))throw Error('review_mismatch');
   if(!Array.isArray(body.decisions)||body.decisions.length!==advice.recommendations.length)throw Error('review_invalid');
   const remaining=new Set(advice.recommendations.map(r=>r.id));
   for(const d of body.decisions)if(!exact(d,['recommendation_id','decision'])||!remaining.delete(d.recommendation_id)||!['accepted','deferred','rejected'].includes(d.decision))throw Error('review_invalid');
   if(localMock){if(adviceHash!==sha(createMockAdvice(value.inspection)))throw Error('review_mismatch');}
   else{
    const grant=readGrant(env);if(!grant||!db)throw Error('review_unavailable');
    const receipt=await createLedger(db,grant).lookup(requestId);
    if(!receipt||receipt.user_hash!==sha(userId)||receipt.state!=='completed'||receipt.mode!=='live'||receipt.grant_id!==grant.grantId||receipt.fixture!==body.fixture||receipt.asset_sha!==body.asset_sha256||receipt.report_sha!==body.report_sha256||receipt.advice_sha!==adviceHash)throw Error('review_mismatch');
   }
   const review={schema_version:1,type:'judge-reviewed-evidence',mode:localMock?'mock':'live',model:NEBIUS_MODEL,request_id:requestId,fixture:body.fixture,asset_sha256:body.asset_sha256,report_sha256:body.report_sha256,advice_sha256:adviceHash,inspection:value.inspection,ai_suggestions:advice,human_review:{actor:localMock?'local_mock_rehearsal':'signed_in_allowlisted_visitor',reviewed_at_utc:new Date().toISOString(),acknowledged_review_only:true,decisions:body.decisions},repair_approved:false,original_asset_unchanged:true,official_validation:'not_run_in_hosted_guided_test',limitations:['Measured structural findings and AI suggestions are separate.','Acceptance authorizes investigation only. No repair is performed.','This report does not certify visual deformation, physics or engine behavior.'],new_provider_requests:0};
   return json({filename:`rig-qa-reviewed-evidence-${body.asset_sha256.slice(0,12)}.json`,review});
  }catch(e){return json({error:['body_invalid','inspection_mismatch','review_invalid','review_mismatch','review_unavailable'].includes(e?.message)?e.message:'review_invalid'},e?.message==='review_unavailable'?503:400);}
 };
}
