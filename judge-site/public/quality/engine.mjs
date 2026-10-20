import {loadGlb,LIMITS,QualityError,ensure,object} from './glb.mjs';
import {identity,multiply,compose,point,inverse,distance,sub,cross,length,signedBend,wrapDegrees,quaternionAngle} from './math.mjs';

export const VERSION='character-quality-1.0.0';
const index=(n,doc)=>Number.isInteger(n)&&n>=0&&n<doc.g.nodes.length;
const finite=(n,min=-1e6,max=1e6)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const vec=(v)=>Array.isArray(v)&&v.length===3&&v.every(n=>finite(n));
const round=n=>Number.isFinite(n)?Math.round(n*1e6)/1e6:'nonfinite';
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const bounded=(v,max)=>Array.isArray(v)&&v.length<=max;
const name=n=>typeof n.name==='string'?n.name.slice(0,160):'';

export function suggestedProfile(doc){
 const byName=new Map(),duplicates=new Set();
 doc.g.nodes.forEach((n,i)=>{const key=name(n).toLowerCase();if(byName.has(key))duplicates.add(key);else byName.set(key,i);});
 const pairs=[];
 doc.g.nodes.forEach((n,i)=>{
  const key=name(n).toLowerCase();let other;
  if(key.includes('left'))other=key.replace('left','right');
  else if(/(^|[_.:-])l([_.:-]|$)/.test(key))other=key.replace(/(^|[_.:-])l(?=([_.:-]|$))/,'$1r');
  else if(/[a-z0-9]L$/.test(name(n)))other=key.slice(0,-1)+'r';
  else if(/^L[A-Z]/.test(name(n)))other='r'+key.slice(1);
  if(other&&byName.has(other)&&!duplicates.has(key)&&!duplicates.has(other)&&doc.parents[i]>=0&&doc.parents[byName.get(other)]>=0)pairs.push([i,byName.get(other)]);
 });
 return {schema_version:1,clips:doc.clips.slice(0,4).map(c=>c.index),samplesPerClip:12,
  symmetry:{pairs,relativeTolerance:.1,ignoredPairs:[]},jointLimits:[],transitions:[],contacts:[],landings:[],
  deformation:{minEdgeRatio:.25,maxEdgeRatio:2.5,minAreaRatio:.1},motion:{maxJointDegreesPerSecond:1080,maxNodeUnitsPerSecond:10}};
}
export function inventory(bytes){
 const doc=loadGlb(bytes);
 return {nodes:doc.g.nodes.map((n,i)=>({index:i,name:name(n),parent:doc.parents[i],skin:n.skin??null,mesh:n.mesh??null})),clips:doc.clips.map(({index,name,duration})=>({index,name,duration:round(duration)})),suggested_profile:suggestedProfile(doc)};
}

export function validateProfile(input,doc,other){
 ensure(keys(input,['schema_version','asset_sha256','other_asset_sha256','clips','samplesPerClip','symmetry','jointLimits','transitions','contacts','landings','ground','deformation','motion','otherTransform']),'PROFILE_SHAPE','Unknown profile field or non-object profile.');
 for(const field of ['asset_sha256','other_asset_sha256'])if(input[field]!==undefined)ensure(typeof input[field]==='string'&&/^[a-f0-9]{64}$/.test(input[field]),'PROFILE_IDENTITY','Invalid asset hash in character profile.');
 ensure(input.schema_version===1,'PROFILE_VERSION','Use character QA profile schema_version 1.');
 ensure(new TextEncoder().encode(JSON.stringify(input)).length<=LIMITS.profileBytes,'PROFILE_LIMIT','Profile exceeds 64 KiB.');
 const defaults=suggestedProfile(doc),p={...defaults,...input};
 ensure(bounded(p.clips,8)&&p.clips.every(i=>Number.isInteger(i)&&i>=0&&i<doc.clips.length)&&new Set(p.clips).size===p.clips.length,'PROFILE_REFERENCE','Choose at most eight distinct animation indices.');
 ensure(Number.isInteger(p.samplesPerClip)&&p.samplesPerClip>=2&&p.samplesPerClip<=48,'PROFILE_LIMIT','Use 2–48 samples per clip.');
 const node=n=>ensure(index(n,doc),'PROFILE_REFERENCE','A primary node index is invalid.');
 const clip=(i,d=doc)=>ensure(i===-1||Number.isInteger(i)&&i>=0&&i<d.clips.length,'PROFILE_REFERENCE','An animation index is invalid.');
 const range=(r,d=doc,which='animation')=>{clip(r[which],d);const duration=r[which]<0?0:d.clips[r[which]].duration;ensure(finite(r.start,0)&&finite(r.end,r.start)&&r.end<=duration+1e-8,'PROFILE_TIME','An interval is outside its animation duration.');};
 ensure(keys(p.symmetry,['pairs','relativeTolerance','ignoredPairs','surface']),'PROFILE_SHAPE','Invalid symmetry configuration.');
 const symmetry={pairs:defaults.symmetry.pairs,relativeTolerance:.1,ignoredPairs:[],...p.symmetry};p.symmetry=symmetry;
 for(const list of [symmetry.pairs,symmetry.ignoredPairs])ensure(bounded(list,128)&&list.every(pair=>bounded(pair,2)&&pair.length===2&&pair[0]!==pair[1]&&pair.every(n=>index(n,doc)&&doc.parents[n]>=0)),'PROFILE_REFERENCE','Symmetry pairs require two distinct non-root node indices.');
 ensure(finite(symmetry.relativeTolerance,0,1),'PROFILE_RANGE','Symmetry tolerance must be a fraction from 0 to 1.');
 if(symmetry.surface!==undefined){const s=symmetry.surface;ensure(keys(s,['axis','plane','tolerance','maxUnmatchedFraction'])&&[0,1,2].includes(s.axis)&&finite(s.plane)&&finite(s.tolerance,1e-6,1e3)&&finite(s.maxUnmatchedFraction,0,1),'PROFILE_RANGE','Surface symmetry needs axis 0/1/2, plane, positive distance tolerance and unmatched fraction.');}
 ensure(bounded(p.jointLimits,64),'PROFILE_LIMIT','At most 64 joint limit rules are supported.');
 for(const r of p.jointLimits){ensure(keys(r,['parent','joint','child','axis','minDegrees','maxDegrees','relativeToRest']),'PROFILE_SHAPE','Invalid joint limit rule.');[r.parent,r.joint,r.child].forEach(node);ensure(doc.parents[r.joint]===r.parent&&doc.parents[r.child]===r.joint&&vec(r.axis)&&length(r.axis)>1e-10&&finite(r.minDegrees,-180,180)&&finite(r.maxDegrees,r.minDegrees,180)&&(r.relativeToRest===undefined||typeof r.relativeToRest==='boolean'),'PROFILE_RANGE','Joint rules need a direct three-node chain, hinge axis and ordered degree limits.');}
 ensure(bounded(p.transitions,32),'PROFILE_LIMIT','At most 32 transition rules are supported.');
 for(const r of p.transitions){ensure(keys(r,['from','to','fromTime','toTime','nodes','maxDistance','maxAngleDegrees','alignRootTranslation','rootNode']),'PROFILE_SHAPE','Invalid transition rule.');clip(r.from);clip(r.to);ensure(bounded(r.nodes,64)&&r.nodes.length>0,'PROFILE_RANGE','Transition rules need node indices.');r.nodes.forEach(node);ensure(finite(r.maxDistance,0)&&finite(r.maxAngleDegrees,0,180)&&(r.alignRootTranslation===undefined||typeof r.alignRootTranslation==='boolean'),'PROFILE_RANGE','Invalid transition tolerances.');if(r.rootNode!==undefined)node(r.rootNode);if(r.fromTime!==undefined)ensure(finite(r.fromTime,0,doc.clips[r.from]?.duration??0),'PROFILE_TIME','Invalid transition source time.');if(r.toTime!==undefined)ensure(finite(r.toTime,0,doc.clips[r.to]?.duration??0),'PROFILE_TIME','Invalid transition destination time.');}
 ensure(bounded(p.contacts,16),'PROFILE_LIMIT','At most 16 contact intervals are supported.');
 for(const r of p.contacts){ensure(keys(r,['aNode','bNode','animation','otherAnimation','start','end','pointA','pointB','maxDistance','maxDrift','phase']),'PROFILE_SHAPE','Invalid contact rule.');node(r.aNode);range(r);ensure(Number.isInteger(r.bNode)&&r.bNode>=0&&finite(r.maxDistance,0)&&finite(r.maxDrift,0)&&(r.pointA===undefined||vec(r.pointA))&&(r.pointB===undefined||vec(r.pointB))&&['grip','release'].includes(r.phase),'PROFILE_RANGE','Invalid contact anchors, phase or tolerances.');if(other){ensure(index(r.bNode,other),'PROFILE_REFERENCE','Counterpart anchor does not exist.');range(r,other,'otherAnimation');}else ensure(Number.isInteger(r.otherAnimation)&&r.otherAnimation>=-1,'PROFILE_REFERENCE','Invalid counterpart animation index.');}
 ensure(bounded(p.landings,16),'PROFILE_LIMIT','At most 16 support intervals are supported.');
 for(const r of p.landings){ensure(keys(r,['node','point','animation','start','end','height','tolerance','maxSlide','axis']),'PROFILE_SHAPE','Invalid support rule.');node(r.node);range(r);ensure((r.point===undefined||vec(r.point))&&[0,1,2].includes(r.axis)&&finite(r.height)&&finite(r.tolerance,0)&&finite(r.maxSlide,0),'PROFILE_RANGE','Support rules need a plane and nonnegative tolerances.');}
 if(p.ground!==undefined){const r=p.ground;ensure(keys(r,['axis','height','tolerance','feet'])&&[0,1,2].includes(r.axis)&&finite(r.height)&&finite(r.tolerance,0)&&bounded(r.feet,64)&&r.feet.length>0,'PROFILE_RANGE','Ground needs a plane and explicit foot anchors.');for(const foot of r.feet){ensure(keys(foot,['node','point'])&&(foot.point===undefined||vec(foot.point)),'PROFILE_SHAPE','Invalid foot anchor.');node(foot.node);}}
 ensure(keys(p.deformation,['minEdgeRatio','maxEdgeRatio','minAreaRatio'])&&finite(p.deformation.minEdgeRatio,0,1)&&finite(p.deformation.maxEdgeRatio,1,100)&&finite(p.deformation.minAreaRatio,0,1),'PROFILE_RANGE','Invalid mesh deformation thresholds.');
 ensure(keys(p.motion,['maxJointDegreesPerSecond','maxNodeUnitsPerSecond'])&&finite(p.motion.maxJointDegreesPerSecond,.01,1e6)&&finite(p.motion.maxNodeUnitsPerSecond,.000001,1e6),'PROFILE_RANGE','Invalid motion rate thresholds.');
 if(p.otherTransform!==undefined){const t=p.otherTransform;ensure(keys(t,['translation','rotation','scale'])&&(t.translation===undefined||vec(t.translation))&&(t.scale===undefined||vec(t.scale))&&(t.rotation===undefined||Array.isArray(t.rotation)&&t.rotation.length===4&&t.rotation.every(n=>finite(n))&&Math.abs(Math.hypot(...t.rotation)-1)<.01),'PROFILE_RANGE','Invalid counterpart placement transform.');}
 return p;
}

function prepareMeshes(doc,omit){
 const meshes=[];let vertices=0;
 for(const [node,n] of doc.g.nodes.entries()){
  if(n.mesh===undefined)continue;
  ensure(Number.isInteger(n.mesh)&&n.mesh>=0&&(n.skin===undefined||Number.isInteger(n.skin)&&n.skin>=0),'MESH_REFERENCE','Mesh and skin references must be unsigned integer indices.');
  const mesh=doc.g.meshes[n.mesh];ensure(mesh&&Array.isArray(mesh.primitives),'MESH_REFERENCE','Invalid mesh reference.');
  for(const [primitive,p] of mesh.primitives.entries()){
   const loc=`/nodes/${node}/mesh/primitives/${primitive}`;
   if((p.mode??4)!==4||p.targets||p.extensions||Object.keys(p.attributes??{}).some(k=>/^(JOINTS|WEIGHTS)_[1-9]/.test(k))){omit(loc+' uses non-triangles, morphs, extensions or more than four influences.');continue;}
   const position=doc.accessor(p.attributes?.POSITION,'VEC3');ensure(position.componentType===5126,'MESH_POSITION','POSITION must use floating-point VEC3.');
   vertices+=position.count;ensure(vertices<=LIMITS.vertices,'VERTEX_LIMIT','At most 30,000 total mesh vertices are evaluated.');
   let joints,weights,skin,bind;
   if(n.skin!==undefined){
    skin=doc.g.skins[n.skin];ensure(skin&&Array.isArray(skin.joints)&&skin.joints.length>0&&skin.joints.length<=LIMITS.nodes&&skin.joints.every(j=>index(j,doc))&&new Set(skin.joints).size===skin.joints.length,'SKIN_REFERENCE','Invalid skin joint list.');
    joints=doc.accessor(p.attributes.JOINTS_0,'VEC4');weights=doc.accessor(p.attributes.WEIGHTS_0,'VEC4');
    ensure([5121,5123].includes(joints.componentType)&&!joints.normalized&&joints.count===position.count&&weights.count===position.count&&([5121,5123].includes(weights.componentType)&&weights.normalized||weights.componentType===5126),'SKIN_ATTRIBUTES','Invalid or mismatched joint and weight attributes.');
    for(let v=0;v<position.count;v++){let sum=0;for(let k=0;k<4;k++){const j=joints.values[v*4+k],w=weights.values[v*4+k];ensure(Number.isInteger(j)&&j>=0&&j<skin.joints.length&&w>=0&&w<=1,'SKIN_ATTRIBUTES','Out-of-range joint or weight.');sum+=w;}ensure(Math.abs(sum-1)<=.01,'SKIN_WEIGHTS','Skin weights must sum to one within 0.01.');}
    const ibm=skin.inverseBindMatrices===undefined?null:doc.accessor(skin.inverseBindMatrices,'MAT4');ensure(!ibm||ibm.componentType===5126&&ibm.count>=skin.joints.length,'INVERSE_BIND','Invalid inverse bind matrices.');
    bind=skin.joints.map((_,i)=>ibm?Array.from(ibm.values.slice(i*16,i*16+16)):identity());
   }
   let indices;if(p.indices!==undefined){const data=doc.accessor(p.indices,'SCALAR');ensure([5121,5123,5125].includes(data.componentType)&&!data.normalized,'MESH_INDICES','Triangle indices must be unnormalized unsigned integers.');indices=data.values;}else indices=Array.from({length:position.count},(_,i)=>i);
   ensure(indices.length%3===0&&indices.length<=300000&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<position.count),'MESH_INDICES','Invalid or excessive triangle indices.');
   meshes.push({node,primitive,position,joints,weights,skin,bind,indices,location:loc});
  }
 }
 return meshes;
}
function skinVertices(mesh,pose,spend){
 spend(mesh.position.count);const out=new Array(mesh.position.count),matrices=mesh.skin?mesh.skin.joints.map((j,i)=>multiply(pose.world[j],mesh.bind[i])):null;
 for(let v=0;v<out.length;v++){
  const p=Array.from(mesh.position.values.slice(v*3,v*3+3));
  if(!matrices)out[v]=point(pose.world[mesh.node],p);
  else{const q=[0,0,0];for(let k=0;k<4;k++){const w=mesh.weights.values[v*4+k];if(w){const value=point(matrices[mesh.joints.values[v*4+k]],p);for(let c=0;c<3;c++)q[c]+=w*value[c];}}out[v]=q;}
  ensure(out[v].every(Number.isFinite),'POSE_NONFINITE','Skin evaluation overflowed.');
 }
 return out;
}
const evenly=(start,end,count)=>start===end?[start]:Array.from({length:count},(_,i)=>start+(end-start)*i/(count-1));
function sampleTimes(clip,count,available){
 const times=new Set(evenly(0,clip.duration,count));let limited=false;
 const add=t=>{if(times.has(t))return true;if(times.size>=available){limited=true;return false;}times.add(t);return true;};
 outer:for(const channel of clip.channels)for(const t of channel.time.values)if(!add(t))break outer;
 if(!limited)outer:for(const channel of clip.channels)for(let i=1;i<channel.time.count;i++)if(!add((channel.time.values[i-1]+channel.time.values[i])/2))break outer;
 return {times:[...times].sort((a,b)=>a-b),limited};
}

export function inspectCharacter(primary,profile,secondary){
 const doc=loadGlb(primary),other=secondary?loadGlb(secondary):null,p=validateProfile(profile??suggestedProfile(doc),doc,other);
 const report={schema_version:1,inspector_version:VERSION,mode:'local_measured',profile:p,summary:{nodes:doc.g.nodes.length,animations:doc.clips.length,selected_clips:p.clips.length,poses_evaluated:0,findings:0},coverage:[],findings:[],repair_approved:false,new_provider_requests:0};
 let work=0,truncated=false;
 const spend=n=>{work+=n;ensure(work<=LIMITS.work,'WORK_LIMIT','The bounded evaluation work limit was reached.');};
 const evaluate=(d,clip=-1,time=0)=>{ensure(report.summary.poses_evaluated<LIMITS.poses,'POSE_LIMIT','The 256-pose evaluation limit was reached.');spend(d.g.nodes.length);report.summary.poses_evaluated++;return d.pose(clip,time);};
 const coverage=(check,status,reason,measurements=0)=>report.coverage.push({check,status,reason,measurements});
 const issue=(code,location,message,evidence)=>{if(report.findings.length>=LIMITS.findings){truncated=true;return;}report.findings.push({id:'Q'+String(report.findings.length+1).padStart(4,'0'),code,severity:'warning',location,message,evidence});};
 const rest=evaluate(doc),positions=rest.positions;
 let symmetryChecks=0;
 for(const [left,right] of p.symmetry.pairs){
  if(p.symmetry.ignoredPairs.some(pair=>pair.includes(left)&&pair.includes(right)))continue;
  const a=distance(positions[left],positions[doc.parents[left]]),b=distance(positions[right],positions[doc.parents[right]]),delta=Math.abs(a-b)/Math.max(a,b,1e-12);symmetryChecks++;
  if(delta>p.symmetry.relativeTolerance)issue('JOINT_SEGMENT_ASYMMETRY',`/nodes/${left}`,'Paired rest-pose joint segments exceed the configured length difference.',{nodes:[left,right],lengths:[round(a),round(b)],relative_difference:round(delta),tolerance:p.symmetry.relativeTolerance});
 }
 coverage('rest_joint_symmetry',symmetryChecks?'checked':'not_checked',symmetryChecks?'Explicit or unambiguous name-paired joint segments; intentional exceptions excluded.':'No paired non-root joints were configured or unambiguously named.',symmetryChecks);
 let meshes=[],meshOmissions=[],meshProblem;
 try{meshes=prepareMeshes(doc,s=>meshOmissions.push(s));}catch(e){if(!(e instanceof QualityError))throw e;meshProblem=e.message;}
 const baseVertices=new Map();let degenerateRestTriangles=0;
 if(!meshProblem)try{for(const mesh of meshes){
  const vertices=skinVertices(mesh,rest,spend);baseVertices.set(mesh,vertices);let count=0,first=-1;
  for(let ti=0;ti<mesh.indices.length;ti+=3){spend(1);const a=vertices[mesh.indices[ti]],b=vertices[mesh.indices[ti+1]],c=vertices[mesh.indices[ti+2]];
   if(length(cross(sub(b,a),sub(c,a)))<=1e-12){count++;if(first<0)first=ti/3;}
  }
  if(count){degenerateRestTriangles+=count;issue('REST_DEGENERATE_TRIANGLES',mesh.location,'Rest triangles have zero or near-zero area; their collapse ratios cannot be measured reliably.',{triangles:count,first_triangle:first,twice_area_tolerance:1e-12});}
 }}catch(e){if(!(e instanceof QualityError))throw e;meshProblem=e.message;}
 if(p.symmetry.surface&&!meshProblem&&meshes.length){
  const s=p.symmetry.surface,vertices=meshes.flatMap(m=>baseVertices.get(m)),grid=new Map(),cell=v=>v.map(x=>Math.floor(x/s.tolerance));
  try{
   for(const vertex of vertices){const key=cell(vertex).join(',');const list=grid.get(key)??[];list.push(vertex);grid.set(key,list);}
   let unmatched=0,worst=0;
   for(const vertex of vertices){spend(1);const mirror=vertex.slice();mirror[s.axis]=2*s.plane-mirror[s.axis];const c=cell(mirror);let nearest=Infinity;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of grid.get([c[0]+x,c[1]+y,c[2]+z].join(','))??[]){spend(1);nearest=Math.min(nearest,distance(mirror,q));}
    if(nearest>s.tolerance)unmatched++;if(Number.isFinite(nearest))worst=Math.max(worst,nearest);
   }
   const fraction=unmatched/Math.max(vertices.length,1);
   if(fraction>s.maxUnmatchedFraction)issue('REST_SURFACE_ASYMMETRY','/meshes','Mirrored rest-surface points exceed the configured unmatched fraction.',{vertices:vertices.length,unmatched,unmatched_fraction:round(fraction),distance_tolerance:s.tolerance,allowed_fraction:s.maxUnmatchedFraction,plane_axis:s.axis,plane:s.plane});
   coverage('rest_surface_symmetry',meshOmissions.length?'partial':'checked','Nearest-point mirror screen on evaluated rest vertices; this does not infer intended anatomy.',vertices.length);
  }catch(e){if(!(e instanceof QualityError))throw e;coverage('rest_surface_symmetry','partial',e.message);}
 }else coverage('rest_surface_symmetry','not_checked',meshProblem??'Supply an explicit mirror plane and surface tolerances; a mesh is required.');
 let frameChecks=0,jointChecks=0,groundChecks=0,deformChecks=0,motionChecks=0,frameProblem;
 let jointUnmeasurable=false;
 const measureBend=(pose,r)=>{const inv=inverse(pose.world[r.parent]);if(!inv)return null;const a=point(inv,pose.positions[r.parent]),b=point(inv,pose.positions[r.joint]),c=point(inv,pose.positions[r.child]);return Math.min(length(sub(b,a)),length(sub(c,b)),length(r.axis))<1e-10?null:signedBend(a,b,c,r.axis);};
 const jointReferences=p.jointLimits.map(r=>measureBend(rest,r));
 try{
  for(const clipIndex of p.clips){const clip=doc.clips[clipIndex];let previous=null,previousTime=0;
   const schedule=sampleTimes(clip,p.samplesPerClip,LIMITS.poses-report.summary.poses_evaluated);
   if(schedule.limited)frameProblem='The pose limit prevented evaluation of every keyframe and interval midpoint.';
   for(const time of schedule.times){
    const pose=evaluate(doc,clipIndex,time);frameChecks++;
    for(const [ri,r] of p.jointLimits.entries()){
     const bend=measureBend(pose,r);
     if(bend===null||jointReferences[ri]===null){jointUnmeasurable=true;issue('JOINT_ANGLE_UNMEASURABLE',`/nodes/${r.joint}`,'A configured hinge contains a collapsed segment or axis; no valid signed angle can be recorded.',{rule:ri,animation:clipIndex,time:round(time)});continue;}
     const value=r.relativeToRest===false?bend:wrapDegrees(bend-jointReferences[ri]);jointChecks++;
     if(value<r.minDegrees-1e-6||value>r.maxDegrees+1e-6)issue('JOINT_LIMIT',`/nodes/${r.joint}`,'The sampled signed hinge bend exceeds its character-specific range.',{animation:clipIndex,time:round(time),degrees:round(value),minimum:r.minDegrees,maximum:r.maxDegrees,relative_to_rest:r.relativeToRest!==false,rule:ri});
    }
    for(const foot of p.ground?.feet??[]){const q=point(pose.world[foot.node],foot.point??[0,0,0]),height=q[p.ground.axis]-p.ground.height;groundChecks++;
     if(height < -p.ground.tolerance)issue('FOOT_PLANE_PENETRATION',`/nodes/${foot.node}`,'A sampled foot anchor is below the configured ground plane.',{animation:clipIndex,time:round(time),signed_height:round(height),tolerance:p.ground.tolerance});
    }
    if(previous&&time>previousTime){const dt=time-previousTime;
     for(let n=0;n<doc.g.nodes.length;n++){const speed=distance(previous.positions[n],pose.positions[n])/dt,angular=quaternionAngle(previous.trs[n].r,pose.trs[n].r)/dt;motionChecks++;
      if(speed>p.motion.maxNodeUnitsPerSecond||angular>p.motion.maxJointDegreesPerSecond)issue('SAMPLED_MOTION_JUMP',`/nodes/${n}`,'A sampled position or local-rotation rate exceeds the configured motion allowance.',{animation:clipIndex,from_time:round(previousTime),to_time:round(time),units_per_second:round(speed),degrees_per_second:round(angular),max_units_per_second:p.motion.maxNodeUnitsPerSecond,max_degrees_per_second:p.motion.maxJointDegreesPerSecond});
     }
    }
    previous=pose;previousTime=time;
    if(!meshProblem)for(const mesh of meshes){const base=baseVertices.get(mesh),current=skinVertices(mesh,pose,spend);let badEdges=0,badAreas=0,firstTriangle=-1,minRatio=Infinity,maxRatio=0;
     for(let ti=0;ti<mesh.indices.length;ti+=3){spend(1);const ids=Array.from(mesh.indices.slice(ti,ti+3)),a=ids.map(i=>base[i]),b=ids.map(i=>current[i]);let bad=false;
      for(let edge=0;edge<3;edge++){const reference=distance(a[edge],a[(edge+1)%3]);if(reference<1e-10)continue;const ratio=distance(b[edge],b[(edge+1)%3])/reference;minRatio=Math.min(minRatio,ratio);maxRatio=Math.max(maxRatio,ratio);if(ratio<p.deformation.minEdgeRatio||ratio>p.deformation.maxEdgeRatio){badEdges++;bad=true;}}
      const area=length(cross(sub(a[1],a[0]),sub(a[2],a[0]))),deformedArea=length(cross(sub(b[1],b[0]),sub(b[2],b[0])));if(area>1e-12&&deformedArea/area<p.deformation.minAreaRatio){badAreas++;bad=true;}if(bad&&firstTriangle<0)firstTriangle=ti/3;
     }
     deformChecks++;if(badEdges||badAreas)issue('SKIN_DEFORMATION',mesh.location,'Evaluated triangle edges or area exceed the configured stretch/collapse allowances.',{animation:clipIndex,time:round(time),first_triangle:firstTriangle,edge_violations:badEdges,collapsed_triangles:badAreas,min_edge_ratio:round(minRatio),max_edge_ratio:round(maxRatio),allowed:p.deformation});
    }
   }
  }
 }catch(e){if(!(e instanceof QualityError))throw e;frameProblem=e.message;}
 const frameStatus=frameProblem?'partial':'checked';
 coverage('signed_joint_limits',jointChecks?(jointUnmeasurable?'partial':frameStatus):'not_checked',frameProblem??(jointUnmeasurable?'A collapsed segment or axis prevented a valid configured hinge measurement.':jointChecks?'Sampled signed hinge angles against the configured axes and ranges.':'Supply explicit three-node hinge rules; anatomy is not guessed.'),jointChecks);
 coverage('foot_ground_plane',groundChecks?frameStatus:'not_checked',frameProblem??(groundChecks?'Sampled configured foot anchors against an explicit plane.':'No ground plane and foot anchors configured.'),groundChecks);
 coverage('evaluated_deformation',deformChecks?(frameProblem||meshOmissions.length||degenerateRestTriangles?'partial':'checked'):'not_checked',frameProblem??meshProblem??(deformChecks?'Linear-blend skinning; sampled edge-length and area ratios relative to rest. '+(degenerateRestTriangles?`${degenerateRestTriangles} degenerate rest triangle(s) have no reliable collapse ratio. `:'')+meshOmissions.join(' '):'No supported triangle mesh and sampled animation.'),deformChecks);
 coverage('within_clip_motion',motionChecks?frameStatus:'not_checked',frameProblem??(motionChecks?'Rates between sampled poses, including keys and interval midpoints within the pose budget; not continuous-time proof.':'No sampled animation interval.'),motionChecks);
 let transitions=0,transitionProblem;
 try{for(const [ri,r] of p.transitions.entries()){
  const ta=r.fromTime??(r.from<0?0:doc.clips[r.from].duration),tb=r.toTime??0,a=evaluate(doc,r.from,ta),b=evaluate(doc,r.to,tb),root=r.rootNode??doc.parents.findIndex(x=>x<0);let worstDistance=0,worstAngle=0,worstNode=r.nodes[0];
  for(const node of r.nodes){const pa=r.alignRootTranslation?sub(a.positions[node],a.positions[root]):a.positions[node],pb=r.alignRootTranslation?sub(b.positions[node],b.positions[root]):b.positions[node],d=distance(pa,pb),angle=quaternionAngle(a.trs[node].r,b.trs[node].r);if(d>worstDistance){worstDistance=d;worstNode=node;}worstAngle=Math.max(worstAngle,angle);}
  transitions++;if(worstDistance>r.maxDistance||worstAngle>r.maxAngleDegrees)issue('CLIP_TRANSITION_DISCONTINUITY','/animations','The configured clip seam exceeds position or local-rotation allowances.',{rule:ri,from:r.from,to:r.to,from_time:round(ta),to_time:round(tb),worst_node:worstNode,max_distance:round(worstDistance),max_local_angle_degrees:round(worstAngle),translation_root_aligned:r.alignRootTranslation===true,allowed_distance:r.maxDistance,allowed_angle_degrees:r.maxAngleDegrees});
 }}catch(e){if(!(e instanceof QualityError))throw e;transitionProblem=e.message;}
 coverage('clip_transitions',transitions?(transitionProblem?'partial':'checked'):'not_checked',transitionProblem??(transitions?'Explicit clip seams; root translation alignment only when requested.':'No transition pairs configured.'),transitions);
 let contacts=0,contactProblem;
 if(other)try{const placement=compose(p.otherTransform?.translation,p.otherTransform?.rotation,p.otherTransform?.scale);
  for(const [ri,r] of p.contacts.entries()){let initial,maxGap=0,maxDrift=0,worstTime=r.start;
   for(const t of evenly(r.start,r.end,p.samplesPerClip)){const a=evaluate(doc,r.animation,t),b=evaluate(other,r.otherAnimation,t),pa=point(a.world[r.aNode],r.pointA??[0,0,0]),pb=point(placement,point(b.world[r.bNode],r.pointB??[0,0,0])),delta=sub(pa,pb);initial??=delta;const gap=length(delta),drift=distance(delta,initial);if(gap>maxGap){maxGap=gap;worstTime=t;}maxDrift=Math.max(maxDrift,drift);}
   contacts++;if(maxGap>r.maxDistance||maxDrift>r.maxDrift)issue(r.phase==='release'?'RELEASE_ALIGNMENT':'PAIRED_GRIP_DRIFT','/contacts','Configured paired anchors exceed gap or relative-drift allowances.',{rule:ri,phase:r.phase,animation:r.animation,other_animation:r.otherAnimation,worst_time:round(worstTime),max_gap:round(maxGap),max_relative_drift:round(maxDrift),allowed_gap:r.maxDistance,allowed_drift:r.maxDrift});
  }
 }catch(e){if(!(e instanceof QualityError))throw e;contactProblem=e.message;}
 coverage('two_character_contact',contacts?(contactProblem?'partial':'checked'):'not_checked',contactProblem??(contacts?'Explicit anchor pairs on synchronized clip times with configured counterpart placement.':other?'No grip/release intervals configured.':'Supply a second GLB and explicit contact rules.'),contacts);
 let landings=0,landingProblem;
 try{for(const [ri,r] of p.landings.entries()){let first,maxHeight=0,maxSlide=0,worstTime=r.start;
  for(const t of evenly(r.start,r.end,p.samplesPerClip)){const pose=evaluate(doc,r.animation,t),q=point(pose.world[r.node],r.point??[0,0,0]);first??=q;const h=Math.abs(q[r.axis]-r.height),slide=Math.hypot(...q.filter((_,i)=>i!==r.axis).map((v,i)=>v-first.filter((_,k)=>k!==r.axis)[i]));if(h>maxHeight){maxHeight=h;worstTime=t;}maxSlide=Math.max(maxSlide,slide);}
  landings++;if(maxHeight>r.tolerance||maxSlide>r.maxSlide)issue('LANDING_SUPPORT','/landings','A required support anchor leaves its plane or slides beyond the configured allowance.',{rule:ri,node:r.node,animation:r.animation,worst_time:round(worstTime),max_plane_distance:round(maxHeight),max_slide:round(maxSlide),allowed_plane_distance:r.tolerance,allowed_slide:r.maxSlide});
 }}catch(e){if(!(e instanceof QualityError))throw e;landingProblem=e.message;}
 coverage('landing_support',landings?(landingProblem?'partial':'checked'):'not_checked',landingProblem??(landings?'Explicit support windows; anchor position only, not contact forces or balance.':'No required support intervals configured.'),landings);
 if(p.clips.length<doc.clips.length)coverage('unselected_clips','not_checked',`${doc.clips.length-p.clips.length} clip(s) were not selected.`);
 if(truncated)coverage('additional_findings','partial','The 128-finding output limit was reached.');
 report.summary.findings=report.findings.length;report.summary.sampled_frames=frameChecks;report.summary.work_units=work;
 report.result=report.findings.length?'review_required':report.coverage.some(c=>c.status!=='checked')?'incomplete':'no_threshold_exceeded_at_sampled_poses';
 report.limitations=['Finite sampled measurements, not continuous-time or visual certification.','Character allowances and anchor placement require author review.','No material appearance, collisions, forces, self-intersection, muscle/bone semantics, engine blending, cloth or physics evaluation.','Raw files and profiles are processed locally; nothing is sent for AI advice.'];
 return report;
}
