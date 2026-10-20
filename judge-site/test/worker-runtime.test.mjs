import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,createFetchMock,Log,LogLevel} from 'miniflare';
import {createMockAdvice,NEBIUS_MODEL} from '../lib/provider.mjs';
import {grantEnv} from './d1-fake.mjs';
import {createHash} from 'node:crypto';
import {createLedger,readGrant,JUDGING_ENDS_AT} from '../lib/ledger.mjs';
const origin='https://judge.test';
const requestId='01234567-1234-4123-8123-123456789abc';
const request=(path,body,id='judge-runtime')=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Rig-QA-Request':'1','oai-authenticated-user-id':id},body:JSON.stringify(body)});
async function runtime(overrides={}){
 const result=await build({stdin:{contents:"import {createQaGateway} from './lib/gateway.mjs'; export default {fetch(request,env){return createQaGateway({env,db:env.DB,localMock:false,now:()=>env.TEST_NOW===undefined?Date.now():Number(env.TEST_NOW)})(request)}}",resolveDir:process.cwd(),sourcefile:'mocked-runtime-entry.mjs'},bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',external:['node:*'],logLevel:'silent'});
 const fetchMock=createFetchMock();fetchMock.disableNetConnect();
 const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,fetchMock,d1Databases:{DB:'qa-runtime'},bindings:{...grantEnv,NEBIUS_API_KEY:'mock-runtime-key-never-real',NEBIUS_LIVE_ALLOWED:'1',JUDGE_ALLOWED_USER_IDS:'judge-runtime',RIG_QA_LOCAL_MOCK:'1',...overrides},log:new Log(LogLevel.ERROR)});
 const db=await mf.getD1Database('DB'),sql=await readFile(new URL('../drizzle/0000_calm_thing.sql',import.meta.url),'utf8');
 await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s.trim())));
 return {mf,fetchMock,db};
}
test('actual local Worker+D1 runtime uses mocked outbound transport once, validates response and durable idempotency',async()=>{
 const {mf,fetchMock,db}=await runtime();
 try{
  const initial=await mf.dispatchFetch(origin+'/api/qa/inspect',request('/api/qa/inspect',{fixture:'flawed'})),s=await initial.json();assert.equal(initial.status,200);assert.equal(s.inspection.findings.filter(f=>f.severity==='error').length,2);
  const advice=createMockAdvice(s.inspection);fetchMock.get('https://api.tokenfactory.nebius.com').intercept({method:'POST',path:'/v1/chat/completions'}).reply(200,{model:NEBIUS_MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify(advice)}}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300}},{headers:{'Content-Type':'application/json'}});
  const body={fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256,request_id:requestId,approved:true};
  const response=await mf.dispatchFetch(origin+'/api/qa/recommend',request('/api/qa/recommend',body));assert.equal(response.status,200);const value=await response.json();assert.equal(value.metadata.new_provider_requests,1);assert.deepEqual(value.advice,advice);
  assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',request('/api/qa/recommend',body))).status,409);
  const budget=await db.prepare('SELECT attempts,in_flight_request_id FROM qa_budget').first();assert.equal(budget.attempts,1);assert.equal(budget.in_flight_request_id,null);
  const receipt=await db.prepare('SELECT state,prompt_tokens,advice_sha FROM qa_requests').first();assert.equal(receipt.state,'completed');assert.equal(receipt.prompt_tokens,100);assert.match(receipt.advice_sha,/^[a-f0-9]{64}$/);
 }finally{await mf.dispose();await fetchMock.close();}
});
test('actual D1 runtime retains an unknown lock when the outbound mock is unavailable; no retry/refund',async()=>{
 const {mf,fetchMock,db}=await runtime();
 try{
  const s=await (await mf.dispatchFetch(origin+'/api/qa/inspect',request('/api/qa/inspect',{fixture:'flawed'}))).json();
  const body={fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256,request_id:requestId,approved:true};
  assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',request('/api/qa/recommend',body))).status,502);
  const again={...body,request_id:'fedcba98-1234-4123-8123-123456789abc'};assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',request('/api/qa/recommend',again))).status,409);
  const b=await db.prepare('SELECT attempts,in_flight_request_id FROM qa_budget').first();assert.equal(b.attempts,1);assert.equal(b.in_flight_request_id,requestId);assert.equal((await db.prepare('SELECT state FROM qa_requests').first()).state,'unknown');
 }finally{await mf.dispose();await fetchMock.close();}
});
test('Worker rejects a provider redirect without following it or sending credentials to its target',async()=>{
 const {mf,fetchMock,db}=await runtime();
 try{
  const s=await (await mf.dispatchFetch(origin+'/api/qa/inspect',request('/api/qa/inspect',{fixture:'flawed'}))).json();
  fetchMock.get('https://api.tokenfactory.nebius.com').intercept({method:'POST',path:'/v1/chat/completions'}).reply(302,'',{headers:{Location:'https://redirect-target.invalid/steal'}});
  const body={fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256,request_id:requestId,approved:true};
  assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',request('/api/qa/recommend',body))).status,502);
  fetchMock.assertNoPendingInterceptors();assert.equal((await db.prepare('SELECT state FROM qa_requests').first()).state,'unknown');
 }finally{await mf.dispose();await fetchMock.close();}
});

const v4Owner={JUDGE_BUDGET_GRANT_ID:'rig_qa_hosted_20261012_01',JUDGE_MAX_ATTEMPTS:'2',JUDGE_MAX_ATTEMPTS_PER_USER:'2',JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD:'450000',JUDGE_TOTAL_MICRO_USD:'900000'};

test('actual Worker signed-in mode rejects missing identity and enforces five per user with mocked provider only',async()=>{
 const {mf,fetchMock,db}=await runtime({JUDGE_ACCESS_MODE:'signed_in',JUDGE_MAX_ATTEMPTS:'33',JUDGE_MAX_ATTEMPTS_PER_USER:'5',JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD:'450000',JUDGE_TOTAL_MICRO_USD:'14850000'});
 const signed=(body,id,email)=>{const r=request('/api/qa/recommend',body,id);if(email!==undefined)r.headers['oai-authenticated-user-email']=email;return r;};
 try{
  const s=await(await mf.dispatchFetch(origin+'/api/qa/inspect',request('/api/qa/inspect',{fixture:'flawed'}))).json(),body={fixture:'flawed',asset_sha256:s.inspection.asset_sha256,report_sha256:s.report_sha256,request_id:requestId,approved:true};
  for(const [id,email]of [['','a@example.invalid'],['unlisted',undefined],['local_seedy','a@example.invalid']])assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',signed(body,id,email))).status,403);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM qa_requests').first()).n,0);
  for(let i=0;i<6;i++){
   fetchMock.get('https://api.tokenfactory.nebius.com').intercept({method:'POST',path:'/v1/chat/completions'}).reply(200,{model:NEBIUS_MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify(createMockAdvice(s.inspection))}}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300}},{headers:{'Content-Type':'application/json'}});
   const id=i<5?'new-judge-a':'new-judge-b',request_id=`01234567-1234-4123-8123-${String(i).padStart(12,'0')}`;assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',signed({...body,request_id},id,id+'@example.invalid'))).status,200);
  }
  assert.equal((await mf.dispatchFetch(origin+'/api/qa/recommend',signed(body,'new-judge-a','another@example.invalid'))).status,409);assert.equal((await db.prepare('SELECT attempts FROM qa_budget').first()).attempts,6);fetchMock.assertNoPendingInterceptors();
 }finally{await mf.dispose();await fetchMock.close();}
});

for(const state of ['completed','unknown'])test('in-place owner review in actual Worker+D1 preserves '+state+' v4 accounting and rejects partial restores',async()=>{
 const id='aaaaaaaa-1234-4123-8123-123456789abc',oldGrant=readGrant(v4Owner),oldState={fingerprint:oldGrant.fingerprint,attempts:1,reserved_micro_usd:450000,in_flight_request_id:state==='unknown'?id:null};
 const overrides={...v4Owner,JUDGE_MAX_ATTEMPTS:'33',JUDGE_MAX_ATTEMPTS_PER_USER:'33',JUDGE_TOTAL_MICRO_USD:'15000000',NEBIUS_LIVE_ALLOWED:'0',JUDGE_ALLOWED_USER_IDS:'owner-a,judge-runtime',JUDGE_ALLOWANCE_OWNER_HASH:createHash('sha256').update('owner-a').digest('hex'),JUDGE_ALLOWANCE_UPDATE_APPROVED:'1',JUDGE_ALLOWANCE_EXPECTED_STATE:JSON.stringify(oldState)};
 const {mf,fetchMock,db}=await runtime(overrides);try{
  const old=createLedger(db,oldGrant,{now:()=>Date.parse('2026-10-16T00:00:00Z')});await old.reserve({requestId:id,userId:'owner-a',reportSha:'a'.repeat(64)});await old.finish(id,{outcome:state,...(state==='completed'?{assetSha:'a'.repeat(64),adviceSha:'b'.repeat(64),fixture:'flawed',usage:{prompt_tokens:10,completion_tokens:20}}:{})});
  const before=await db.prepare('SELECT * FROM qa_requests').all(),path='/api/qa/owner/review-allowance';assert.equal((await mf.dispatchFetch(origin+path,request(path,{approved:true}))).status,403);
  const results=await Promise.all([mf.dispatchFetch(origin+path,request(path,{approved:true},'owner-a')),mf.dispatchFetch(origin+path,request(path,{approved:true},'owner-a'))]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal((await Promise.all(results.map(r=>r.json()))).filter(r=>r.updated).length,1);assert.deepEqual((await db.prepare('SELECT * FROM qa_requests').all()).results,before.results);
  const ledger=createLedger(db,readGrant({...grantEnv,...overrides}));let budget=await db.prepare('SELECT * FROM qa_budget').first();assert.equal(budget.attempts,1);assert.equal(budget.reserved_micro_usd,450000);assert.equal(budget.in_flight_request_id,oldState.in_flight_request_id);
  if(state==='unknown')await assert.rejects(ledger.reserve({requestId,userId:'judge-runtime',reportSha:'a'.repeat(64)}),{code:'request_in_flight'});
  else{await ledger.reserve({requestId,userId:'judge-runtime',reportSha:'a'.repeat(64)});await ledger.finish(requestId,{outcome:'failed'});assert.equal((await mf.dispatchFetch(origin+path,request(path,{approved:true},'owner-a'))).status,200);await db.prepare('UPDATE qa_budget SET attempts=1,reserved_micro_usd=450000').run();budget=await db.prepare('SELECT * FROM qa_budget').first();assert.equal((await mf.dispatchFetch(origin+path,request(path,{approved:true},'owner-a'))).status,409);await assert.rejects(ledger.reserve({requestId:'bbbbbbbb-1234-4123-8123-123456789abc',userId:'judge-runtime',reportSha:'a'.repeat(64)}),{code:'accounting_mismatch'});assert.deepEqual(await db.prepare('SELECT * FROM qa_budget').first(),budget);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM qa_requests').first()).n,2);}
  fetchMock.assertNoPendingInterceptors();
 }finally{await mf.dispose();await fetchMock.close();}
});
test('actual Worker cutoff rejects a new advice request at 20:00 UTC without a provider request or reservation',async()=>{
 const {mf,fetchMock,db}=await runtime({TEST_NOW:String(Date.parse(JUDGING_ENDS_AT))});try{const response=await mf.dispatchFetch(origin+'/api/qa/recommend',request('/api/qa/recommend',{}));assert.equal(response.status,409);assert.equal((await response.json()).error,'judging_window_closed');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM qa_budget').first()).n,0);assert.equal((await mf.dispatchFetch(origin+'/api/qa/inspect',request('/api/qa/inspect',{fixture:'flawed'}))).status,200);fetchMock.assertNoPendingInterceptors();}finally{await mf.dispose();await fetchMock.close();}
});
