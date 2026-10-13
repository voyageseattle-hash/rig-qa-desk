import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,createFetchMock,Log,LogLevel} from 'miniflare';
import {createMockAdvice,NEBIUS_MODEL} from '../lib/provider.mjs';
import {grantEnv} from './d1-fake.mjs';
const origin='https://judge.test';
const requestId='01234567-1234-4123-8123-123456789abc';
const request=(path,body,id='judge-runtime')=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Rig-QA-Request':'1','oai-authenticated-user-id':id},body:JSON.stringify(body)});
async function runtime(){
 const result=await build({stdin:{contents:"import {createQaGateway} from './lib/gateway.mjs'; export default {fetch(request,env){return createQaGateway({env,db:env.DB,localMock:false})(request)}}",resolveDir:process.cwd(),sourcefile:'mocked-runtime-entry.mjs'},bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',external:['node:*'],logLevel:'silent'});
 const fetchMock=createFetchMock();fetchMock.disableNetConnect();
 const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,fetchMock,d1Databases:{DB:'qa-runtime'},bindings:{...grantEnv,NEBIUS_API_KEY:'mock-runtime-key-never-real',NEBIUS_LIVE_ALLOWED:'1',JUDGE_ALLOWED_USER_IDS:'judge-runtime',RIG_QA_LOCAL_MOCK:'1'},log:new Log(LogLevel.ERROR)});
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
