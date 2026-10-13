import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createQaGateway} from '../lib/gateway.mjs';
import {createExportHandler} from '../lib/exports.mjs';
import {createLedger,readGrant} from '../lib/ledger.mjs';
import {createMockAdvice} from '../lib/provider.mjs';
import {sqliteD1,grantEnv} from './d1-fake.mjs';
const origin='https://judge.test',id='01234567-1234-4123-8123-123456789abc';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const request=(path,body,user='local_seedy')=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Rig-QA-Request':'1',...(user?{'oai-authenticated-user-id':user}:{})},body:JSON.stringify(body)});
async function sample(){const gateway=createQaGateway({localMock:true});return (await gateway(request('/api/qa/inspect',{fixture:'flawed'}))).json();}
function reviewBody(s,advice=createMockAdvice(s.inspection)){return {fixture:'flawed',request_id:id,asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256,advice,decisions:advice.recommendations.map(r=>({recommendation_id:r.id,decision:'deferred'})),acknowledged_review_only:true};}
test('measured handoff is free, exact, source investigation only, without owner review or AI',async()=>{
 const s=await sample(),handler=createExportHandler();
 const r=await handler(request('/api/qa/handoff',{fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256},null));assert.equal(r.status,200);
 const v=await r.json();assert.match(v.markdown,/Vertex|vertex|JOINT_INDEX_RANGE/);assert.match(v.markdown,/Do not guess/);assert.match(v.markdown,/not run in this hosted/);assert.equal(v.repair_approved,false);assert.equal(v.new_provider_requests,0);assert.equal(v.human_review,'not recorded');
});
test('measured export rejects changed report, extra fields and foreign origin',async()=>{
 const s=await sample(),handler=createExportHandler(),body={fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256};
 assert.equal((await handler(request('/api/qa/handoff',{...body,report_sha256:'0'.repeat(64)}))).status,400);
 assert.equal((await handler(request('/api/qa/handoff',{...body,repair_approved:true}))).status,400);
 const foreign=request('/api/qa/handoff',body);foreign.headers.set('Origin','https://foreign.test');assert.equal((await handler(foreign)).status,403);
});
test('local mock review is labeled and requires every choice/acknowledgment, never repair',async()=>{
 const s=await sample(),handler=createExportHandler({localMock:true}),body=reviewBody(s);
 const response=await handler(request('/api/qa/review',body));assert.equal(response.status,200);const {review}=await response.json();
 assert.equal(review.mode,'mock');assert.equal(review.human_review.actor,'local_mock_rehearsal');assert.equal(review.repair_approved,false);assert.equal(review.new_provider_requests,0);
 for(const bad of [{...body,acknowledged_review_only:false},{...body,decisions:[]},{...body,decisions:body.decisions.map(d=>({...d,decision:'apply_repair'}))},{...body,advice:{...body.advice,summary:'Altered output'}},{...body,repair_approved:true}])assert.equal((await handler(request('/api/qa/review',bad))).status,400);
 assert.equal((await handler(request('/api/qa/review',body,null))).status,403);
});
test('live reviewed export binds the signed-in reviewer, completed receipt and exact advice',async()=>{
 const s=await sample(),db=sqliteD1(),env={...grantEnv,JUDGE_ALLOWED_USER_IDS:'judge-a,judge-b'},ledger=createLedger(db,readGrant(env)),body=reviewBody(s),handler=createExportHandler({env,db});
 try{await ledger.reserve({requestId:id,userId:'judge-a',reportSha:s.report_sha256});assert.equal((await handler(request('/api/qa/review',body,'judge-a'))).status,400);
 await ledger.finish(id,{outcome:'completed',assetSha:s.inspection.asset_sha256,fixture:'flawed',adviceSha:sha(body.advice)});
 const reply=await handler(request('/api/qa/review',body,'judge-a'));assert.equal(reply.status,200);assert.equal((await reply.json()).review.mode,'live');
 assert.equal((await handler(request('/api/qa/review',body,'judge-b'))).status,400);
 assert.equal((await handler(request('/api/qa/review',{...body,advice:{...body.advice,summary:'Changed'}},'judge-a'))).status,400);
 assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts,1);
 }finally{db.close();}
});
test('oversized export input and malformed recommendation are refused',async()=>{
 const s=await sample(),handler=createExportHandler({localMock:true}),body=reviewBody(s);
 const tooLarge=request('/api/qa/review',{...body,advice:{...body.advice,summary:'x'.repeat(70000)}});assert.equal((await handler(tooLarge)).status,400);
 assert.equal((await handler(request('/api/qa/review',{...body,advice:{...body.advice,recommendations:[{...body.advice.recommendations[0],finding_ids:['not-measured']}]}}))).status,400);
});
