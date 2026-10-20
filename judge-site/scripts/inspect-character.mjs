// Read-only character QA. No inference, engine edits, imports, repairs or DB access.
import {readFile,stat,writeFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {LIMITS} from '../public/quality/glb.mjs';

const args=process.argv.slice(2),options={};
try{
 for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--asset','--other','--profile','--output','--inventory'].includes(key)||Object.hasOwn(options,key)||!args[i+1])throw Error('Use --asset file.glb [--other counterpart.glb] [--profile allowances.json] [--output new-report.json] [--inventory yes].');options[key]=args[i+1];}
 if(!options['--asset']||options['--inventory']&&!['yes','no'].includes(options['--inventory']))throw Error('An --asset GLB is required; --inventory accepts yes or no.');
 const read=async(path,max)=>{const info=await stat(path);if(!info.isFile()||info.size>max)throw Error('Input is not a regular file or exceeds its bounded size limit.');const bytes=await readFile(path);if(bytes.length>max)throw Error('Input changed beyond its size limit while reading.');return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
 const primary=await read(options['--asset'],LIMITS.bytes),secondary=options['--other']?await read(options['--other'],LIMITS.bytes):undefined;
 let profile;if(options['--profile'])profile=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await read(options['--profile'],LIMITS.profileBytes)));
 const worker=new Worker(new URL('./character-cli-worker.mjs',import.meta.url),{resourceLimits:{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:32}});
 const result=await new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('The 15-second character evaluation deadline was reached; no complete report was written.')),15000);
  worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!settled)finish(Error('Character worker exited before completing: '+code));});
  worker.once('message',r=>r.ok?finish(undefined,r.value):finish(Error(r.code+': '+r.message)));
  worker.postMessage({mode:options['--inventory']==='yes'?'inventory':'inspect',primary,...(secondary?{secondary}:{}),...(profile!==undefined?{profile}:{})},[primary,...(secondary?[secondary]:[])]);
 });
 const output=JSON.stringify(result.report??result,null,2)+'\n';
 if(options['--output']){await writeFile(options['--output'],output,{flag:'wx'});process.stdout.write('Measured report written to a new output file. No original asset was changed.\n');}else process.stdout.write(output);
}catch(error){process.stderr.write('Character QA did not complete: '+error.message+'\n');process.exitCode=1;}
