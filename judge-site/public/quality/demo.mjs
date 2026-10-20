// Owned procedural counterexamples. No game character or private asset is included.
export function qualityDemo(flawed=true){
 function make(broken){
  const chunks=[],bufferViews=[],accessors=[];let bytes=0;
  const add=(values,type,componentType=5126)=>{
   const width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[type],size=componentType===5126?4:2,raw=new Uint8Array(Math.ceil(values.length*size/4)*4),view=new DataView(raw.buffer);
   values.forEach((n,i)=>componentType===5126?view.setFloat32(i*size,n,true):view.setUint16(i*size,n,true));
   const bi=bufferViews.length;bufferViews.push({buffer:0,byteOffset:bytes,byteLength:values.length*size});chunks.push(raw);bytes+=raw.length;
   return accessors.push({bufferView:bi,componentType,count:values.length/width,type})-1;
  };
  const positions=add([-.5,0,0,.5,0,0,broken?.25:0,1,0],'VEC3'),joints=add(new Array(12).fill(0),'VEC4',5123),weights=add([1,0,0,0,1,0,0,0,1,0,0,0],'VEC4'),times=add([0,.5,1],'SCALAR');
  const tr=add(broken?[0,0,0,.2,0,0,.4,0,0]:new Array(9).fill(0),'VEC3');
  const scale=add(broken?[1,1,1,4,1,1,1,1,1]:[1,1,1,1,1,1,1,1,1],'VEC3');
  const rot=add(broken?[0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2,0,0,0,1]:[0,0,0,1,0,0,0,1,0,0,0,1],'VEC4');
  const foot=add(broken?[0,0,0,0,-.2,0,0,0,0]:new Array(9).fill(0),'VEC3');
  const anchor=add(broken?[0,1,0,.5,1,0,1,1,0]:[0,1,0,0,1,0,0,1,0],'VEC3');
  const nodes=[{name:'Root',children:[1,4,7,8,9]},
   {name:'UpperL',translation:[-.3,1,0],children:[2]},{name:'ForeL',translation:[0,-.5,0],children:[3]},{name:'HandL',translation:[0,broken?-.8:-.5,0]},
   {name:'UpperR',translation:[.3,1,0],children:[5]},{name:'ForeR',translation:[0,-.5,0],children:[6]},{name:'HandR',translation:[0,-.5,0]},
   {name:'Foot',translation:[0,0,0]},{name:'Surface',mesh:0,skin:0},{name:'Contact',translation:[0,1,0]}];
  const animation=(name,outputs)=>({name,samplers:outputs.map(output=>({input:times,output,interpolation:'LINEAR'})),channels:outputs.map((_,sampler)=>({sampler,target:{node:[0,0,2,7,9][sampler],path:['translation','scale','rotation','translation','translation'][sampler]}}))});
  const zeroTr=add(new Array(9).fill(0),'VEC3'),unitScale=add([1,1,1,1,1,1,1,1,1],'VEC3'),zeroRot=add([0,0,0,1,0,0,0,1,0,0,0,1],'VEC4'),restAnchor=add([0,1,0,0,1,0,0,1,0],'VEC3');
  const g={asset:{version:'2.0',generator:'Rig QA owned character-quality counterexample'},scene:0,scenes:[{nodes:[0]}],nodes,skins:[{joints:[0]}],meshes:[{primitives:[{attributes:{POSITION:positions,JOINTS_0:joints,WEIGHTS_0:weights}}]}],animations:[animation('Action',[tr,scale,rot,foot,anchor]),animation('Recovery',[zeroTr,unitScale,zeroRot,zeroTr,restAnchor])],buffers:[{byteLength:bytes}],bufferViews,accessors};
  const json=new TextEncoder().encode(JSON.stringify(g)),jsonSize=Math.ceil(json.length/4)*4,out=new Uint8Array(28+jsonSize+bytes),header=new DataView(out.buffer);
  header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,out.length,true);header.setUint32(12,jsonSize,true);header.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+jsonSize);out.set(json,20);header.setUint32(20+jsonSize,bytes,true);header.setUint32(24+jsonSize,0x004e4942,true);let offset=28+jsonSize;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
 }
 return {primary:make(flawed),secondary:make(false),profile:{schema_version:1,clips:[0,1],samplesPerClip:5,
  symmetry:{pairs:[[1,4],[2,5],[3,6]],relativeTolerance:.1,ignoredPairs:[],surface:{axis:0,plane:0,tolerance:.01,maxUnmatchedFraction:.1}},
  jointLimits:[{parent:1,joint:2,child:3,axis:[0,0,1],minDegrees:-30,maxDegrees:30,relativeToRest:true}],
  ground:{axis:1,height:0,tolerance:.01,feet:[{node:7}]},
  transitions:[{from:0,to:1,nodes:[0,3,6],maxDistance:.05,maxAngleDegrees:20}],
  contacts:[{aNode:9,bNode:9,animation:0,otherAnimation:0,start:0,end:1,maxDistance:.05,maxDrift:.05,phase:'grip'},{aNode:9,bNode:9,animation:0,otherAnimation:0,start:1,end:1,maxDistance:.05,maxDrift:.05,phase:'release'}],
  landings:[{node:7,animation:0,start:0,end:1,axis:1,height:0,tolerance:.01,maxSlide:.05}],
  deformation:{minEdgeRatio:.25,maxEdgeRatio:2.5,minAreaRatio:.1},motion:{maxJointDegreesPerSecond:60,maxNodeUnitsPerSecond:2}}};
}
