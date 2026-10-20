import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {qualityDemo} from '../public/quality/demo.mjs';
const execute=promisify(execFile),cli=fileURLToPath(new URL('../scripts/inspect-character.mjs',import.meta.url));
test('CLI measures owned files without modifying inputs; output is create-only and invalid profiles fail',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'rig-character-cli-'));
 try{
  const d=qualityDemo(true),asset=join(folder,'owned.glb'),other=join(folder,'other.glb'),profile=join(folder,'profile.json'),output=join(folder,'report.json');
  await Promise.all([writeFile(asset,d.primary),writeFile(other,d.secondary),writeFile(profile,JSON.stringify(d.profile))]);
  const {stdout}=await execute(process.execPath,[cli,'--asset',asset,'--other',other,'--profile',profile],{timeout:20000,maxBuffer:1024*1024});const result=JSON.parse(stdout);assert.ok(result.findings.some(f=>f.code==='JOINT_SEGMENT_ASYMMETRY'));assert.equal(result.new_provider_requests,0);assert.deepEqual(await readFile(asset),Buffer.from(d.primary));
  await execute(process.execPath,[cli,'--asset',asset,'--other',other,'--profile',profile,'--output',output],{timeout:20000});const existing=await readFile(output);await assert.rejects(execute(process.execPath,[cli,'--asset',asset,'--other',other,'--profile',profile,'--output',output],{timeout:20000}));assert.deepEqual(await readFile(output),existing);
  await writeFile(profile,JSON.stringify({...d.profile,asset_sha256:'a'.repeat(64)}));await assert.rejects(execute(process.execPath,[cli,'--asset',asset,'--profile',profile],{timeout:20000}));
 }finally{assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep)&&folder.includes('rig-character-cli-'));await rm(folder,{recursive:true,force:true});}
});
