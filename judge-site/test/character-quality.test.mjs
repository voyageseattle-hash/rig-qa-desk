import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {qualityDemo} from '../public/quality/demo.mjs';
import {inventory,inspectCharacter} from '../public/quality/engine.mjs';
import {loadGlb,QualityError,LIMITS} from '../public/quality/glb.mjs';
import {compose,multiply,point,slerp,quaternionAngle} from '../public/quality/math.mjs';
import {canonical,runLocalJob} from '../public/quality/worker.mjs';
import {encodeGlb} from '../shared/fixtures/encode.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const arrayBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
function edit(bytes,change){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(12,true),g=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+n))),bin=Buffer.from(bytes.subarray(28+n));change(g,bin);return encodeGlb(g,bin);}
const codes=report=>new Set(report.findings.map(f=>f.code));
const coverage=(report,key)=>report.coverage.find(c=>c.check===key);
function simpleClip(interpolation='LINEAR',rotation=false){
 const times=Buffer.alloc(8);times.writeFloatLE(0,0);times.writeFloatLE(1,4);
 const values=interpolation==='CUBICSPLINE'?(rotation?[0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0]:[0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0]):(rotation?[0,0,0,1,0,0,1,0]:[0,0,0,2,0,0]);
 const out=Buffer.alloc(values.length*4);values.forEach((x,i)=>out.writeFloatLE(x,i*4));
 return encodeGlb({asset:{version:'2.0'},nodes:[{}],animations:[{samplers:[{input:0,output:1,interpolation}],channels:[{sampler:0,target:{node:0,path:rotation?'rotation':'translation'}}]}],buffers:[{byteLength:times.length+out.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:times.length},{buffer:0,byteOffset:8,byteLength:out.length}],accessors:[{bufferView:0,componentType:5126,count:2,type:'SCALAR'},{bufferView:1,componentType:5126,count:values.length/(rotation?4:3),type:rotation?'VEC4':'VEC3'}]},Buffer.concat([times,out]));
}

test('owned counterexample measures all four requested areas; valid counterpart clears the same rules',()=>{
 const expected=['JOINT_SEGMENT_ASYMMETRY','REST_SURFACE_ASYMMETRY','JOINT_LIMIT','FOOT_PLANE_PENETRATION','SKIN_DEFORMATION','SAMPLED_MOTION_JUMP','CLIP_TRANSITION_DISCONTINUITY','PAIRED_GRIP_DRIFT','RELEASE_ALIGNMENT','LANDING_SUPPORT'];
 for(const flawed of [true,false]){const d=qualityDemo(flawed),before=sha(d.primary),r=inspectCharacter(d.primary,d.profile,d.secondary);assert.equal(sha(d.primary),before);assert.equal(r.repair_approved,false);assert.equal(r.new_provider_requests,0);assert.ok(r.coverage.every(c=>c.status==='checked'));if(flawed)for(const code of expected)assert.ok(codes(r).has(code),code);else{assert.deepEqual(r.findings,[]);assert.equal(r.result,'no_threshold_exceeded_at_sampled_poses');}assert.deepEqual(r,inspectCharacter(d.primary,d.profile,d.secondary));}
});
test('name pairing supports camel-case suffixes, separated sides and Left/Right; ambiguous names remain unpaired',()=>{
 const d=qualityDemo(false),pairs=inventory(d.primary).suggested_profile.symmetry.pairs;assert.deepEqual(pairs,[[1,4],[2,5],[3,6]]);
 const mixed=edit(d.primary,g=>{g.nodes[1].name='LeftArm';g.nodes[4].name='RightArm';g.nodes[2].name='fore.L';g.nodes[5].name='fore.R';g.nodes[3].name='hand_l';g.nodes[6].name='hand_r';});assert.equal(inventory(mixed).suggested_profile.symmetry.pairs.length,3);
 const duplicate=edit(mixed,g=>{g.nodes[3].name='LeftArm';});assert.ok(!inventory(duplicate).suggested_profile.symmetry.pairs.some(p=>p.includes(1)||p.includes(3)));
});
test('intentional asymmetry is excluded only by the explicit profile; missing rules cannot produce a complete result',()=>{
 const d=qualityDemo(true),p={...d.profile,clips:[],jointLimits:[],transitions:[],contacts:[],landings:[],symmetry:{pairs:[[3,6]],relativeTolerance:.1,ignoredPairs:[[3,6]]}};
 delete p.ground;const r=inspectCharacter(d.primary,p);assert.deepEqual(r.findings,[]);assert.equal(r.result,'incomplete');assert.equal(coverage(r,'rest_joint_symmetry').status,'not_checked');assert.equal(coverage(r,'two_character_contact').status,'not_checked');
});
test('world transforms are parent-first even with reversed JSON node order; inverse transform multiplication is correct',()=>{
 const b=encodeGlb({asset:{version:'2.0'},nodes:[{translation:[0,2,0]},{translation:[3,0,0],children:[0]}]});assert.deepEqual(loadGlb(b).pose().positions[0],[3,2,0]);
 const m=multiply(compose([3,2,1]),compose([-3,-2,-1]));assert.deepEqual(point(m,[1,2,3]),[1,2,3]);
 const q=slerp([0,0,0,1],[0,0,0,-1],.5);assert.equal(quaternionAngle(q,[0,0,0,1]),0);
});
test('LINEAR/STEP/CUBICSPLINE translation and shortest-path quaternion interpolation follow their actual semantics',()=>{
 assert.equal(loadGlb(simpleClip()).pose(0,.5).positions[0][0],1);
 assert.equal(loadGlb(simpleClip('STEP')).pose(0,.5).positions[0][0],0);
 assert.equal(loadGlb(simpleClip('CUBICSPLINE')).pose(0,.5).positions[0][0],1);
 assert.ok(Math.abs(quaternionAngle(loadGlb(simpleClip('LINEAR',true)).pose(0,.5).trs[0].r,[0,0,0,1])-90)<1e-6);
 assert.ok(Math.abs(Math.hypot(...loadGlb(simpleClip('CUBICSPLINE',true)).pose(0,.5).trs[0].r)-1)<1e-10);
});
test('keys and interval midpoints catch a spike between uniform sample times',()=>{
 const d=qualityDemo(false),bytes=edit(d.primary,(g,bin)=>{const a=g.accessors[3],v=g.bufferViews[a.bufferView];bin.writeFloatLE(.001,v.byteOffset+4);const out=g.accessors[g.animations[0].samplers[0].output],ov=g.bufferViews[out.bufferView];bin.writeFloatLE(10,ov.byteOffset+12);});
 const p={...d.profile,samplesPerClip:2,clips:[0]};const r=inspectCharacter(bytes,p,d.secondary);assert.ok(codes(r).has('SAMPLED_MOTION_JUMP'));assert.ok(r.findings.some(f=>f.evidence.to_time===.001));
});
test('paired gap and release checks use the explicit counterpart transform; zero offset is a measured counterexample',()=>{
 const d=qualityDemo(false),p={...d.profile,otherTransform:{translation:[1,0,0]}};const r=inspectCharacter(d.primary,p,d.secondary);assert.ok(codes(r).has('PAIRED_GRIP_DRIFT'));assert.ok(codes(r).has('RELEASE_ALIGNMENT'));
 p.otherTransform.translation=[0,0,0];assert.deepEqual(inspectCharacter(d.primary,p,d.secondary).findings,[]);
});
test('root translation alignment is explicit and does not erase absolute world-space seam failures by default',()=>{
 const d=qualityDemo(false),b=edit(d.primary,(g,bin)=>{const a=g.accessors[g.animations[0].samplers[0].output],v=g.bufferViews[a.bufferView];for(let k=0;k<3;k++)bin.writeFloatLE(.4,v.byteOffset+k*12);});
 const p={...d.profile,clips:[],jointLimits:[],contacts:[],landings:[],symmetry:{pairs:[],relativeTolerance:.1,ignoredPairs:[]},transitions:[{from:0,to:1,nodes:[0,3,6],maxDistance:.01,maxAngleDegrees:10}]};delete p.ground;
 assert.ok(codes(inspectCharacter(b,p)).has('CLIP_TRANSITION_DISCONTINUITY'));p.transitions[0].alignRootTranslation=true;assert.deepEqual(inspectCharacter(b,p).findings,[]);
});
test('work/pose limits and unselected clips remain explicitly incomplete, never clean certificates',()=>{
 const d=qualityDemo(false),p={...d.profile,samplesPerClip:48,contacts:Array.from({length:16},()=>({...d.profile.contacts[0]}))};const r=inspectCharacter(d.primary,p,d.secondary);assert.ok(r.summary.poses_evaluated<=LIMITS.poses);assert.ok(r.coverage.some(c=>c.status==='partial'));assert.equal(r.result,'incomplete');
 const few={...d.profile,clips:[0]};assert.equal(coverage(inspectCharacter(d.primary,few,d.secondary),'unselected_clips').status,'not_checked');
});
test('unsupported mesh deformation is separate from successfully measured skeleton data',()=>{
 const d=qualityDemo(false),b=edit(d.primary,g=>{g.meshes[0].primitives[0].targets=[];});const r=inspectCharacter(b,d.profile,d.secondary);assert.equal(coverage(r,'evaluated_deformation').status,'not_checked');assert.equal(coverage(r,'rest_joint_symmetry').status,'checked');assert.equal(r.result,'incomplete');
});
test('unknown/malformed profile fields, references, thresholds and intervals are rejected',()=>{
 const d=qualityDemo(false);
 const mutations=[p=>p.unknown=true,p=>p.clips=[999],p=>p.samplesPerClip=Infinity,p=>p.symmetry.relativeTolerance=-1,p=>p.jointLimits[0].axis=[0,0,0],p=>p.jointLimits[0].child=9,p=>p.contacts[0].bNode=999,p=>p.landings[0].end=2,p=>p.otherTransform={rotation:[0,0,0,0]},p=>p.deformation.minEdgeRatio=2];
 for(const mutate of mutations){const p=structuredClone(d.profile);mutate(p);assert.throws(()=>inspectCharacter(d.primary,p,d.secondary),QualityError);}
});
test('malformed GLB references, cycles, accessors, floats, weights and animation times fail closed',()=>{
 const d=qualityDemo(false),mutations=[g=>g.nodes[0].children.push(0),g=>g.nodes[4].children.push(2),g=>g.buffers[0].uri='https://invalid.example/asset.bin',g=>g.extensionsRequired=['KHR_draco_mesh_compression'],g=>g.nodes[0].rotation=[0,0,0,0]];
 for(const mutate of mutations)assert.throws(()=>inspectCharacter(edit(d.primary,mutate),d.profile,d.secondary),QualityError);
 for(const mutate of [g=>g.accessors[0].byteOffset=1,g=>g.accessors[0].count=1000000]){const partial=inspectCharacter(edit(d.primary,mutate),d.profile,d.secondary);assert.equal(coverage(partial,'evaluated_deformation').status,'not_checked');assert.equal(partial.result,'incomplete');}
 const duplicate=edit(d.primary,(g,bin)=>bin.writeFloatLE(0,g.bufferViews[g.accessors[3].bufferView].byteOffset+4));assert.throws(()=>loadGlb(duplicate),/strictly increasing/);
 const nonfinite=edit(d.primary,(g,bin)=>bin.writeFloatLE(Infinity,g.bufferViews[0].byteOffset));const r=inspectCharacter(nonfinite,d.profile,d.secondary);assert.equal(coverage(r,'evaluated_deformation').status,'not_checked');assert.equal(r.result,'incomplete');
});
test('binary bounds and deep JSON are rejected without fetching external resources',()=>{
 const d=qualityDemo(false);const short=d.primary.slice(0,-1);assert.throws(()=>loadGlb(short),QualityError);
 const b=edit(d.primary,g=>{g.accessors[0].byteOffset=999999;});assert.equal(coverage(inspectCharacter(b,d.profile,d.secondary),'evaluated_deformation').status,'not_checked');
 let value={};for(let i=0;i<70;i++)value={value};assert.throws(()=>loadGlb(encodeGlb({asset:{version:'2.0'},extras:value})),/complexity/);
});
test('worker report binds raw asset, counterpart, profile and measured content with reproducible hashes',async()=>{
 const d=qualityDemo(false),job={mode:'inspect',primary:arrayBuffer(d.primary),secondary:arrayBuffer(d.secondary),profile:d.profile},a=await runLocalJob(job),b=await runLocalJob(job);assert.deepEqual(a,b);assert.equal(a.report.asset_sha256,sha(d.primary));assert.equal(a.report.other_asset_sha256,sha(d.secondary));assert.equal(a.report.profile_sha256,sha(canonical(a.report.profile)));const copy=structuredClone(a.report),hash=copy.report_sha256;delete copy.report_sha256;assert.equal(hash,sha(canonical(copy)));assert.equal(a.report.new_provider_requests,0);
});
test('downloaded character profiles cannot silently run against different files',async()=>{
 const a=qualityDemo(false),b=qualityDemo(true),meta=await runLocalJob({mode:'inventory',primary:arrayBuffer(a.primary)});
 await assert.rejects(runLocalJob({mode:'inspect',primary:arrayBuffer(b.primary),profile:meta.suggested_profile}),{code:'PROFILE_IDENTITY'});
 const wrongOther={...a.profile,other_asset_sha256:sha(b.primary)};await assert.rejects(runLocalJob({mode:'inspect',primary:arrayBuffer(a.primary),secondary:arrayBuffer(a.secondary),profile:wrongOther}),{code:'PROFILE_IDENTITY'});
});
test('joint bends are measured in the parent frame; inherited scale cannot invent a hinge angle',()=>{
 const d=qualityDemo(false),p={...d.profile,contacts:[],landings:[],transitions:[],symmetry:{pairs:[],relativeTolerance:.1,ignoredPairs:[]}};
 const collapsed=edit(d.primary,g=>{g.nodes[3].translation=[0,0,0];});const r=inspectCharacter(collapsed,p);assert.ok(codes(r).has('JOINT_ANGLE_UNMEASURABLE'));assert.notEqual(coverage(r,'signed_joint_limits').status,'checked');
});
test('non-root scene references are rejected before quality measurements',()=>{
 const d=qualityDemo(false),bad=edit(d.primary,g=>{g.scenes[0].nodes=[2];});assert.throws(()=>loadGlb(bad),{code:'SCENE_HIERARCHY'});
});

test('an already collapsed rest triangle is a warning with incomplete deformation ratios',()=>{
 const d=qualityDemo(false),b=edit(d.primary,(g,bin)=>{const a=g.accessors[0],v=g.bufferViews[a.bufferView];for(let k=0;k<9;k++)bin.writeFloatLE(0,v.byteOffset+k*4);});
 const r=inspectCharacter(b,d.profile,d.secondary);assert.ok(codes(r).has('REST_DEGENERATE_TRIANGLES'));assert.equal(coverage(r,'evaluated_deformation').status,'partial');assert.equal(r.result,'review_required');
});
