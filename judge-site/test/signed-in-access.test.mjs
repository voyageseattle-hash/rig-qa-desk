import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createQaGateway,resolveJudgeUser} from '../lib/gateway.mjs';
import {createExportHandler} from '../lib/exports.mjs';
import {createLedger,readGrant,JUDGING_ENDS_AT} from '../lib/ledger.mjs';
import {createMockAdvice,requestRecommendations,NEBIUS_MODEL} from '../lib/provider.mjs';
import {sqliteD1} from './d1-fake.mjs';
const origin='https://signed-in-judge.test',now=()=>Date.parse('2026-10-19T02:06:54Z');
const oldEnv={JUDGE_BUDGET_GRANT_ID:'rig_qa_hosted_20261012_01',JUDGE_MAX_ATTEMPTS:'2',JUDGE_MAX_ATTEMPTS_PER_USER:'2',JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD:'450000',JUDGE_TOTAL_MICRO_USD:'900000'};
const env={...oldEnv,JUDGE_MAX_ATTEMPTS:'33',JUDGE_MAX_ATTEMPTS_PER_USER:'5',JUDGE_TOTAL_MICRO_USD:'14850000',JUDGE_ACCESS_MODE:'signed_in',NEBIUS_LIVE_ALLOWED:'1',NEBIUS_API_KEY:'SYNTHETIC_NOT_A_REAL_KEY'};
const sha=value=>createHash('sha256').update(value).digest('hex');
function request(path,body,user='judge-a',email=user?user+'@example.invalid':null,extra={}){return new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Rig-QA-Request':'1',...(user===null?{}:{'oai-authenticated-user-id':user}),...(email===null?{}:{'oai-authenticated-user-email':email}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const measured=async handler=>(await handler(request('/api/qa/inspect',{fixture:'flawed'},null))).json();
const bodyFor=s=>({fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256,request_id:randomUUID(),approved:true});
const answer=report=>({advice:createMockAdvice(report),metadata:{provider:'nebius',mode:'live',model:NEBIUS_MODEL,response_model:NEBIUS_MODEL,usage:{prompt_tokens:1413,completion_tokens:1419,total_tokens:2832}}});

test('signed-in mode needs both dispatch identity headers; missing, malformed and local simulation identity remain denied',async()=>{
 const db=sqliteD1();let calls=0;const handler=createQaGateway({env,db,now,provider:async report=>{calls++;return answer(report);}});
 try{const s=await measured(handler),body=bodyFor(s);
  for(const [id,email]of [[null,null],[null,'a@example.invalid'],['judge-a',null],['judge-a','not-an-email'],['judge-a','a@example.invalid,b@example.invalid'],['local_seedy','a@example.invalid'],['bad id','a@example.invalid'],['a'.repeat(161),'a@example.invalid']])assert.equal((await handler(request('/api/qa/recommend',body,id,email))).status,403);
  assert.equal(calls,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM qa_requests').get().n,0);
  const status=await(await handler(request('/api/qa/status',undefined,null))).json();assert.equal(status.access_mode,'signed_in');assert.equal(status.available_to_user,false);assert.equal(status.budget,null);assert.equal(status.access_fingerprint,null);
  const reply=await handler(request('/api/qa/recommend',body,'new-unlisted-judge'));assert.equal(reply.status,200);assert.equal(calls,1);
 }finally{db.close();}
});

test('allowlist remains the default; invalid access modes fail closed and request body/query cannot select authorization',async()=>{
 const req=request('/api/qa/status',undefined,'owner-a');assert.equal(resolveJudgeUser(req,{JUDGE_ALLOWED_USER_IDS:'owner-a'}),'owner-a');
 assert.equal(resolveJudgeUser(req,{JUDGE_ALLOWED_USER_IDS:'owner-a',JUDGE_ACCESS_MODE:'allowlist'}),'owner-a');
 for(const mode of ['signed-in','public','',true])assert.equal(resolveJudgeUser(req,{JUDGE_ALLOWED_USER_IDS:'owner-a',JUDGE_ACCESS_MODE:mode}),null);
 const db=sqliteD1();let calls=0;const handler=createQaGateway({env:{...env,JUDGE_ACCESS_MODE:'allowlist'},db,now,provider:()=>{calls++;}});
 try{const s=await measured(handler);assert.equal((await handler(request('/api/qa/recommend?JUDGE_ACCESS_MODE=signed_in',{...bodyFor(s),JUDGE_ACCESS_MODE:'signed_in'}))).status,403);assert.equal(calls,0);}finally{db.close();}
});

test('approved 33/five grant transition preserves historical receipt and consumption; per-identity and global ceilings both apply',async()=>{
 const db=sqliteD1(),old=createLedger(db,readGrant(oldEnv),{now}),historicalId=randomUUID();let calls=0;
 try{
  await old.reserve({requestId:historicalId,userId:'owner-a',reportSha:'a'.repeat(64)});await old.finish(historicalId,{outcome:'completed',assetSha:'b'.repeat(64),adviceSha:'c'.repeat(64),fixture:'flawed',usage:{prompt_tokens:1413,completion_tokens:1419}});
  const historical=await old.lookup(historicalId),row=db.sqlite.prepare('SELECT * FROM qa_budget').get(),expected={fingerprint:row.fingerprint,attempts:1,reserved_micro_usd:450000,in_flight_request_id:null};
  const review=createQaGateway({env:{...env,NEBIUS_LIVE_ALLOWED:'0',JUDGE_ALLOWANCE_OWNER_HASH:sha('owner-a'),JUDGE_ALLOWANCE_UPDATE_APPROVED:'1',JUDGE_ALLOWANCE_EXPECTED_STATE:JSON.stringify(expected)},db,now});
  assert.equal((await review(request('/api/qa/owner/review-allowance',{approved:true},'unlisted-nonowner'))).status,403);
  assert.equal((await review(request('/api/qa/owner/review-allowance',{approved:true,total:20000000},'owner-a'))).status,400);
  const acknowledged=await(await review(request('/api/qa/owner/review-allowance',{approved:true},'owner-a'))).json();assert.equal(acknowledged.updated,true);assert.equal(acknowledged.new_provider_requests,0);
  const handler=createQaGateway({env,db,now,provider:async report=>{calls++;return answer(report);}}),s=await measured(handler);
  for(let k=0;k<32;k++){
   const id='judge-'+Math.floor(k/5),response=await handler(request('/api/qa/recommend',bodyFor(s),id,k%2?'alias@example.invalid':id+'@example.invalid'));assert.equal(response.status,200);
   if(k===4){const before=calls;assert.equal((await handler(request('/api/qa/recommend',bodyFor(s),id,'changed@example.invalid'))).status,409);assert.equal(calls,before);}
  }
  const cap=await handler(request('/api/qa/recommend',bodyFor(s),'another-identity'));assert.equal(cap.status,409);assert.equal((await cap.json()).error,'allowance_exhausted');assert.equal(calls,32);
  const final=db.sqlite.prepare('SELECT * FROM qa_budget').get();assert.equal(final.attempts,33);assert.equal(final.reserved_micro_usd,14850000);assert.equal(final.in_flight_request_id,null);assert.deepEqual(await createLedger(db,readGrant(env),{now}).lookup(historicalId),historical);
 }finally{db.close();}
});

test('concurrent signed-in users share one durable lock; duplicate spelling and restart never dispatch again',async()=>{
 const db=sqliteD1();let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});const provider=async report=>{calls++;await gate;return answer(report);};const handler=createQaGateway({env,db,now,provider});
 try{const s=await measured(handler),body=bodyFor(s),first=handler(request('/api/qa/recommend',body,'first'));
  while(calls===0)await new Promise(resolve=>setImmediate(resolve));
  const waiting=await Promise.all(Array.from({length:12},(_,k)=>handler(request('/api/qa/recommend',bodyFor(s),'concurrent-'+k))));assert.ok(waiting.every(r=>r.status===409));assert.equal(calls,1);
  release();assert.equal((await first).status,200);
  for(const user of ['first','different'])assert.equal((await handler(request('/api/qa/recommend',{...body,request_id:body.request_id.toUpperCase()},user))).status,409);
  const restarted=createQaGateway({env,db,now,provider});assert.equal((await restarted(request('/api/qa/recommend',body,'first'))).status,409);assert.equal(calls,1);assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts,1);
 }finally{release();db.close();}
});

test('signed-in timeout keeps consumed reservation and unknown lock across identities without retry',async()=>{
 const db=sqliteD1();let calls=0;const handler=createQaGateway({env,db,now,provider:(report,options)=>requestRecommendations(report,{...options,timeoutMs:5,fetchImpl:async()=>{calls++;return new Promise(()=>{});}})});
 try{const s=await measured(handler),body=bodyFor(s);assert.equal((await handler(request('/api/qa/recommend',body))).status,502);for(const user of ['judge-a','judge-b'])assert.equal((await handler(request('/api/qa/recommend',bodyFor(s),user))).status,409);assert.equal(calls,1);assert.equal(db.sqlite.prepare('SELECT state FROM qa_requests').get().state,'unknown');assert.equal(db.sqlite.prepare('SELECT reserved_micro_usd FROM qa_budget').get().reserved_micro_usd,450000);}finally{db.close();}
});

test('public signed-in review export remains bound to the originating identity; anonymous free handoff remains free',async()=>{
 const db=sqliteD1(),handler=createQaGateway({env,db,now,provider:async report=>answer(report)}),exports=createExportHandler({env,db,localMock:false});
 try{const s=await measured(handler),body=bodyFor(s),reply=await(await handler(request('/api/qa/recommend',body,'judge-a'))).json(),review={fixture:'flawed',request_id:body.request_id,asset_sha256:body.asset_sha256,report_sha256:body.report_sha256,advice:reply.advice,decisions:reply.advice.recommendations.map(r=>({recommendation_id:r.id,decision:'deferred'})),acknowledged_review_only:true};
  assert.equal((await exports(request('/api/qa/review',review,'judge-b'))).status,400);assert.equal((await exports(request('/api/qa/review',review,null))).status,403);assert.equal((await exports(request('/api/qa/review',review,'judge-a'))).status,200);
  const free=await exports(request('/api/qa/handoff',{fixture:'flawed',asset_sha256:body.asset_sha256,report_sha256:body.report_sha256},null));assert.equal(free.status,200);assert.equal((await free.json()).new_provider_requests,0);
 }finally{db.close();}
});

test('signed-in mode preserves paid-off configuration, cutoff, same-origin and strict-body gates',async()=>{
 const db=sqliteD1();let calls=0;const provider=()=>{calls++;};
 try{const handler=createQaGateway({env,db,now,provider}),s=await measured(handler),body=bodyFor(s);
  assert.equal((await handler(request('/api/qa/recommend',body,'judge-a',undefined,{Origin:'https://other.invalid'}))).status,403);
  assert.equal((await handler(request('/api/qa/recommend',{...body,max_attempts:999}))).status,400);
  assert.equal((await createQaGateway({env:{...env,NEBIUS_LIVE_ALLOWED:'0'},db,now,provider})(request('/api/qa/recommend',body))).status,503);
  const closed=createQaGateway({env,db,now:()=>Date.parse(JUDGING_ENDS_AT),provider});assert.equal((await closed(request('/api/qa/recommend',body))).status,409);assert.equal((await closed(request('/api/qa/inspect',{fixture:'flawed'},null))).status,200);assert.equal(calls,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM qa_requests').get().n,0);
 }finally{db.close();}
});
