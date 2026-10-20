// Column-major glTF transforms. No renderer, filesystem, network or asset writes.
export const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
export const sub = (a,b) => a.map((v,i)=>v-b[i]);
export const dot = (a,b) => a.reduce((v,x,i)=>v+x*b[i],0);
export const length = a => Math.hypot(...a);
export const distance = (a,b) => length(sub(a,b));
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function unit(a) { const n=length(a); if(!Number.isFinite(n)||n<1e-12) throw Error('Degenerate vector or quaternion.'); return a.map(v=>v/n); }
export function multiply(a,b) {
 const out=new Array(16).fill(0);
 for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];
 return out;
}
export function compose(t=[0,0,0],rotation=[0,0,0,1],s=[1,1,1]) {
 const [x,y,z,w]=unit(rotation),xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
 return [(1-2*(yy+zz))*s[0],2*(xy+wz)*s[0],2*(xz-wy)*s[0],0,
  2*(xy-wz)*s[1],(1-2*(xx+zz))*s[1],2*(yz+wx)*s[1],0,
  2*(xz+wy)*s[2],2*(yz-wx)*s[2],(1-2*(xx+yy))*s[2],0,...t,1];
}
export const point=(m,p=[0,0,0])=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
export const direction=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]);
export function inverse(m){
 const rows=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>m[c*4+r]),...Array.from({length:4},(_,c)=>r===c?1:0)]);
 for(let c=0;c<4;c++){let pivot=c;for(let r=c+1;r<4;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;if(Math.abs(rows[pivot][c])<1e-12)return null;[rows[c],rows[pivot]]=[rows[pivot],rows[c]];const divisor=rows[c][c];rows[c]=rows[c].map(v=>v/divisor);for(let r=0;r<4;r++)if(r!==c){const factor=rows[r][c];rows[r]=rows[r].map((v,k)=>v-factor*rows[c][k]);}}
 const out=Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);return out.every(Number.isFinite)?out:null;
}
export function slerp(a,b,t) {
 a=unit(a);b=unit(b);let d=dot(a,b);
 if(d<0){b=b.map(v=>-v);d=-d;}
 if(d>.9995)return unit(a.map((v,i)=>v+(b[i]-v)*t));
 const theta=Math.acos(Math.min(1,d)),den=Math.sin(theta);
 return a.map((v,i)=>(Math.sin((1-t)*theta)*v+Math.sin(t*theta)*b[i])/den);
}
export const quaternionAngle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(dot(unit(a),unit(b)))))*180/Math.PI;
export const signedBend=(parent,joint,child,axis)=>Math.atan2(dot(unit(axis),cross(sub(joint,parent),sub(child,joint))),dot(sub(joint,parent),sub(child,joint)))*180/Math.PI;
export const wrapDegrees=n=>((n+180)%360+360)%360-180;
