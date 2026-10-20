import {identity,compose,multiply,point,slerp,unit} from './math.mjs';

export const LIMITS=Object.freeze({bytes:32*1024*1024,json:4*1024*1024,nodes:1024,animations:64,accessors:4096,scalars:2000000,vertices:30000,poses:256,work:3000000,findings:128,profileBytes:65536});
export class QualityError extends Error { constructor(code,message){super(message);this.name='QualityError';this.code=code;} }
export const ensure=(condition,code,message)=>{if(!condition)throw new QualityError(code,message);};
export const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e9);
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const components={5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};
export function loadGlb(input) {
 const bytes=input instanceof ArrayBuffer?new Uint8Array(input):input;
 ensure(bytes instanceof Uint8Array&&bytes.length>=20,'GLB_HEADER','Choose a complete binary glTF 2.0 file.');
 ensure(bytes.length<=LIMITS.bytes,'ASSET_LIMIT','The local inspection limit is 32 MiB per GLB.');
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 ensure(header.getUint32(0,true)===0x46546c67&&header.getUint32(4,true)===2&&header.getUint32(8,true)===bytes.length,'GLB_HEADER','Invalid GLB header or declared length.');
 let g,bin=new Uint8Array(),chunks=0,seenBin=false;
 for(let offset=12;offset<bytes.length;){
  ensure(++chunks<=64&&offset+8<=bytes.length,'GLB_CHUNK','Invalid or excessive GLB chunks.');
  const size=header.getUint32(offset,true),type=header.getUint32(offset+4,true);
  ensure(size%4===0&&size<=bytes.length-offset-8,'GLB_CHUNK','Unaligned or out-of-bounds GLB chunk.');
  const data=bytes.subarray(offset+8,offset+8+size);
  if(type===0x4e4f534a){ensure(chunks===1&&!g&&size<=LIMITS.json,'JSON_LIMIT','GLB JSON must be the first, bounded chunk.');try{g=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{throw new QualityError('JSON_PARSE','Invalid UTF-8 JSON.');}}
  else if(type===0x004e4942){ensure(chunks===2&&!seenBin,'GLB_CHUNK','A single BIN chunk must follow JSON.');bin=data;seenBin=true;}
  else throw new QualityError('UNSUPPORTED_CHUNK','Unknown GLB chunks are not evaluated.');
  offset+=8+size;
 }
 ensure(object(g)&&g.asset?.version==='2.0','JSON_SHAPE','Expected glTF 2.0 metadata.');
 ensure(g.asset.minVersion===undefined||g.asset.minVersion==='2.0','UNSUPPORTED_VERSION','A newer required glTF version is not evaluated.');
 const pending=[[g,0]];let jsonWork=0;
 while(pending.length){const [v,d]=pending.pop();ensure(++jsonWork<=100000&&d<=64,'JSON_LIMIT','JSON complexity limit exceeded.');if(v&&typeof v==='object'){const values=Object.values(v);ensure(jsonWork+pending.length+values.length<=100000,'JSON_LIMIT','JSON complexity limit exceeded.');for(const x of values)pending.push([x,d+1]);}}
 for(const key of ['nodes','animations','accessors','bufferViews','buffers','skins','meshes']){
  g[key]??=[];const max=key==='nodes'?LIMITS.nodes:key==='animations'?LIMITS.animations:LIMITS.accessors;
  ensure(Array.isArray(g[key])&&g[key].length<=max&&g[key].every(object),'JSON_SHAPE','Unsupported '+key+' collection.');
 }
 ensure(!g.extensionsRequired?.length,'UNSUPPORTED_EXTENSION','Required glTF extensions need a compatible decoder and are not evaluated.');
 ensure(g.buffers.length<=1&&g.buffers.every(b=>!('uri'in b)&&uint(b.byteLength)&&b.byteLength<=bin.length&&bin.length-b.byteLength<=3),'EXTERNAL_BUFFER','Only a self-contained, uncompressed GLB BIN buffer is evaluated.');
 const cache=new Map();let scalars=0;
 function accessor(index,type){
  ensure(uint(index)&&index<g.accessors.length,'ACCESSOR_REFERENCE','Invalid accessor reference.');
  const a=g.accessors[index],c=components[a.componentType],width=widths[a.type];
  ensure(c&&width&&(!type||a.type===type)&&uint(a.count)&&a.count>0,'ACCESSOR_SHAPE','Invalid accessor component, type or count.');
  ensure(!a.sparse&&uint(a.bufferView),'UNSUPPORTED_ACCESSOR','Sparse and implicit-zero accessors are not evaluated.');
  ensure(a.normalized===undefined||typeof a.normalized==='boolean'&&(!a.normalized||![5125,5126].includes(a.componentType)),'ACCESSOR_SHAPE','Invalid accessor normalization.');
  if(cache.has(index))return cache.get(index);
  const view=g.bufferViews[a.bufferView],offset=a.byteOffset??0;
  ensure(view&&view.buffer===0&&!view.extensions&&uint(view.byteOffset??0)&&uint(view.byteLength)&&view.byteLength>0,'BUFFER_VIEW','Invalid or compressed buffer view.');
  const start=(view.byteOffset??0)+offset,stride=view.byteStride??width*c[0];
  ensure(uint(offset)&&uint(stride)&&stride>=width*c[0]&&stride%c[0]===0&&start%c[0]===0&&(!view.byteStride||(stride>=4&&stride<=252&&stride%4===0)),'ACCESSOR_LAYOUT','Invalid accessor alignment or stride.');
  ensure(Number.isSafeInteger(a.count*width)&&scalars+a.count*width<=LIMITS.scalars,'WORK_LIMIT','Decoded scalar limit exceeded.');
  ensure(start+(a.count-1)*stride+width*c[0]<=(view.byteOffset??0)+view.byteLength&&(view.byteOffset??0)+view.byteLength<=g.buffers[0]?.byteLength,'ACCESSOR_BOUNDS','Accessor data is outside its buffer view.');
  const values=new Float64Array(a.count*width),v=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  for(let i=0;i<a.count;i++)for(let k=0;k<width;k++){let n=v[c[1]](start+i*stride+k*c[0],true);ensure(Number.isFinite(n),'NONFINITE_VALUE','Accessor contains nonfinite values.');if(a.normalized)n=Math.max(-1,n/c[2]);values[i*width+k]=n;}
  scalars+=values.length;const decoded={values,count:a.count,width,type:a.type,componentType:a.componentType,normalized:a.normalized===true};cache.set(index,decoded);return decoded;
 }
 const parents=new Int32Array(g.nodes.length).fill(-1),order=[],state=new Uint8Array(g.nodes.length);
 for(const [i,n] of g.nodes.entries()){
  for(const [key,size] of [['translation',3],['rotation',4],['scale',3],['matrix',16]])if(n[key]!==undefined)ensure(vector(n[key],size),'NODE_TRANSFORM','Invalid node transform.');
  ensure(!n.matrix||!['translation','rotation','scale'].some(k=>n[k]!==undefined),'NODE_TRANSFORM','A node cannot combine a matrix and TRS.');
  if(n.matrix)ensure([3,7,11].every(k=>Math.abs(n.matrix[k])<1e-10)&&Math.abs(n.matrix[15]-1)<1e-10,'NODE_TRANSFORM','Only affine matrices are evaluated.');
  if(n.rotation)ensure(Math.abs(Math.hypot(...n.rotation)-1)<.01,'QUATERNION','Node rotations must be unit quaternions.');
  ensure(n.children===undefined||Array.isArray(n.children)&&n.children.length<=g.nodes.length,'NODE_HIERARCHY','Invalid children list.');
  for(const child of n.children??[]){ensure(uint(child)&&child<g.nodes.length&&parents[child]===-1,'NODE_HIERARCHY','Invalid child, duplicate child or multiple parent.');parents[child]=i;}
 }
 // Explicit stack: chains never recurse on the JS stack.
 for(let root=0;root<g.nodes.length;root++)if(!state[root]){const stack=[[root,false]];while(stack.length){const [i,done]=stack.pop();if(done){state[i]=2;continue;}ensure(state[i]!==1,'NODE_CYCLE','Node cycle cannot be evaluated.');if(state[i]===2)continue;state[i]=1;stack.push([i,true]);if(parents[i]>=0&&state[parents[i]]!==2)stack.push([parents[i],false]);}}
 const visit=i=>{if(state[i]===3)return;if(parents[i]>=0)ensure(state[parents[i]]===3,'NODE_CYCLE','Invalid hierarchy order.');state[i]=3;order.push(i);};
 // Parent-first queue, independent of JSON node ordering.
 const queue=[];for(let i=0;i<parents.length;i++)if(parents[i]<0)queue.push(i);
 for(let cursor=0;cursor<queue.length;cursor++){const i=queue[cursor];visit(i);queue.push(...(g.nodes[i].children??[]));}
 ensure(order.length===g.nodes.length,'NODE_CYCLE','Node cycle cannot be evaluated.');
 if(g.scenes!==undefined){ensure(Array.isArray(g.scenes)&&g.scenes.length<=LIMITS.nodes,'SCENE_SHAPE','Invalid scene collection.');for(const scene of g.scenes)ensure(object(scene)&&(scene.nodes===undefined||Array.isArray(scene.nodes)&&new Set(scene.nodes).size===scene.nodes.length&&scene.nodes.every(i=>uint(i)&&i<g.nodes.length&&parents[i]<0)),'SCENE_HIERARCHY','Scene roots must reference distinct hierarchy root nodes.');}
 if(g.scene!==undefined)ensure(uint(g.scene)&&g.scene<(g.scenes?.length??0),'SCENE_REFERENCE','Invalid default scene.');
 const clips=g.animations.map((animation,ai)=>{
  ensure(Array.isArray(animation.channels)&&animation.channels.length<=4096&&Array.isArray(animation.samplers),'ANIMATION_SHAPE','Invalid animation channel list.');
  const targets=new Set();let duration=0;
  const channels=animation.channels.map(channel=>{
   const target=channel.target,mode=animation.samplers[channel.sampler]?.interpolation??'LINEAR',s=animation.samplers[channel.sampler];
   ensure(uint(channel.sampler)&&s&&target&&uint(target.node)&&target.node<g.nodes.length&&['translation','rotation','scale'].includes(target.path)&&['LINEAR','STEP','CUBICSPLINE'].includes(mode),'UNSUPPORTED_ANIMATION','Only node translation/rotation/scale animation is evaluated.');
   ensure(!g.nodes[target.node].matrix&&!targets.has(target.node+':'+target.path),'ANIMATION_TARGET','Duplicate animation targets or matrix-node animation are invalid.');targets.add(target.node+':'+target.path);
   const time=accessor(s.input,'SCALAR'),value=accessor(s.output,target.path==='rotation'?'VEC4':'VEC3');
   ensure(time.componentType===5126&&value.componentType===5126&&value.count===time.count*(mode==='CUBICSPLINE'?3:1),'ANIMATION_SHAPE','Animation time/output types or counts do not match.');
   for(let k=0;k<time.count;k++)ensure(time.values[k]>=0&&(k===0||time.values[k]>time.values[k-1]),'ANIMATION_TIME','Times must be nonnegative and strictly increasing.');
   if(target.path==='rotation')for(let k=0;k<time.count;k++){const offset=(k*(mode==='CUBICSPLINE'?3:1)+(mode==='CUBICSPLINE'?1:0))*4;ensure(Math.abs(Math.hypot(...value.values.slice(offset,offset+4))-1)<.01,'QUATERNION','Rotation keys must be unit quaternions.');}
   duration=Math.max(duration,time.values[time.count-1]);return {...target,mode,time,value};
  });
  return {index:ai,name:typeof animation.name==='string'?animation.name.slice(0,160):'Animation '+ai,duration,channels};
 });
 function pose(animation=-1,t=0){
  ensure(animation===-1||uint(animation)&&animation<clips.length,'PROFILE_REFERENCE','Animation index does not exist.');
  ensure(Number.isFinite(t)&&t>=0&&(animation<0||t<=clips[animation].duration+1e-8),'PROFILE_TIME','Sample time is outside the clip.');
  const trs=g.nodes.map(n=>({t:n.translation??[0,0,0],r:n.rotation??[0,0,0,1],s:n.scale??[1,1,1]}));
  for(const c of clips[animation]?.channels??[]){
   const ts=c.time.values,n=c.value.width,values=c.value.values;let lo=0,hi=ts.length-1;
   while(lo+1<hi){const mid=(lo+hi)>>1;if(ts[mid]<=t)lo=mid;else hi=mid;}
   if(t<=ts[0])lo=hi=0;else if(t>=ts[ts.length-1])lo=hi=ts.length-1;
   const dt=ts[hi]-ts[lo],u=dt>0?(t-ts[lo])/dt:0,at=(i,part=0)=>Array.from(values.slice((i*(c.mode==='CUBICSPLINE'?3:1)+part)*n,(i*(c.mode==='CUBICSPLINE'?3:1)+part+1)*n));
   let value;
   if(c.mode==='CUBICSPLINE'){const a=at(lo,1),b=at(hi,1),out=at(lo,2),incoming=at(hi,0);value=a.map((x,k)=>(2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*dt*out[k]+(-2*u**3+3*u*u)*b[k]+(u**3-u*u)*dt*incoming[k]);if(c.path==='rotation')value=unit(value);}
   else if(c.mode==='STEP'||lo===hi)value=at(lo);
   else value=c.path==='rotation'?slerp(at(lo),at(hi),u):at(lo).map((x,k)=>x+(at(hi)[k]-x)*u);
   trs[c.node][{translation:'t',rotation:'r',scale:'s'}[c.path]]=value;
  }
  const world=new Array(g.nodes.length);
  for(const i of order){const local=g.nodes[i].matrix??compose(trs[i].t,trs[i].r,trs[i].s);world[i]=parents[i]<0?local:multiply(world[parents[i]],local);ensure(world[i].every(Number.isFinite),'POSE_NONFINITE','Transform evaluation overflowed.');}
  return {world,trs,positions:world.map(m=>point(m))};
 }
 return {g,parents,clips,accessor,pose};
}
