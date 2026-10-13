import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createQaGateway,resolveJudgeUser} from '../lib/gateway.mjs';
const fingerprint=id=>createHash('sha256').update(id).digest('hex');
const request=id=>new Request('https://qa.test/api/qa/status',{headers:id?{'oai-authenticated-user-id':id}:{}});
test('site-scoped fingerprint allowlist authorizes only its exact authenticated identity',()=>{
 const id='site-scoped-owned-reviewer',env={JUDGE_ALLOWED_USER_HASHES:fingerprint(id)};
 assert.equal(resolveJudgeUser(request(id),env),id);
 assert.equal(resolveJudgeUser(request('different-reviewer'),env),null);
 assert.equal(resolveJudgeUser(request(),env),null);
 assert.equal(resolveJudgeUser(request('local_seedy'),{JUDGE_ALLOWED_USER_HASHES:fingerprint('local_seedy')}),null);
 assert.equal(resolveJudgeUser(request(id),{JUDGE_ALLOWED_USER_HASHES:'not-a-hash'}),null);
 assert.equal(resolveJudgeUser(request(id),{JUDGE_ALLOWED_USER_IDS:id}),id);
});
test('status exposes only the caller fingerprint and cannot enable live access itself',async()=>{
 const id='site-scoped-owned-reviewer';
 const value=await (await createQaGateway({env:{}})(request(id))).json();
 assert.equal(value.access_fingerprint,fingerprint(id));
 assert.equal(value.live_enabled,false);assert.equal(value.available_to_user,false);
 assert.equal(JSON.stringify(value).includes(id),false);
 for(const rejected of [null,'local_seedy','invalid user'])assert.equal((await (await createQaGateway({env:{}})(request(rejected))).json()).access_fingerprint,null);
});
