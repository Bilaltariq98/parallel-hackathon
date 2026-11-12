import * as T from 'three';
export const root=b=>b.parent?root(b.parent):b;
export const children=(b,bodies)=>bodies.filter(x=>x.parent===b);
export const members=(b,bodies)=>bodies.filter(x=>x===b||isBelow(x,b));
function isBelow(x,b){return !!x.parent&&(x.parent===b||isBelow(x.parent,b))}
export function move(b,delta,bodies){for(const x of members(b,bodies))x.group.position.add(delta)}
export function extent(b,bodies){return Math.max(b.radius*2.05,...children(b,bodies).map(x=>x.shell+extent(x,bodies)))}
function reserve(b,bodies){
 const kids=children(b,bodies);for(const x of kids)reserve(x,bodies);
 let edge=b.radius*2.05+.4;
 if(b.compactSystem){
  for(let lane=0;lane<=Math.max(-1,...kids.map(x=>Math.floor(x.compactSlot/4)));lane++){
   const group=kids.filter(x=>Math.floor(x.compactSlot/4)===lane),r=Math.max(0,...group.map(x=>extent(x,bodies)));
   const shell=Math.max((edge+r+.6)/.97,1.5*r+1,...group.map(x=>x.shell||0));
   for(const x of group)x.shell=shell;edge=shell+r+.6;
  }
 }else for(const x of kids){const r=extent(x,bodies);x.shell=Math.max(x.shell||0,(edge+r+.6)/.97);edge=x.shell+r+.6}
}
export function attach(child,parent,bodies,scene,{immediate=false}={}){
 if(child===parent||members(child,bodies).includes(parent))return;
 child.parent=parent;const v=child.group.position.clone().sub(parent.group.position);
 child.phase=Math.atan2(v.y,v.x);child.shell=0;child.speed=.11+((bodies.indexOf(child)%5)*.012);child.inclination=.04+(bodies.indexOf(child)%3)*.025;
 if(parent.compactSystem){child.compactSlot=Math.max(-1,...children(parent,bodies).filter(x=>x!==child).map(x=>x.compactSlot))+1;child.speed=.09;child.phase=(parent.orbitClock||0)*.09+(child.compactSlot%4)*Math.PI/2;child.inclination=.04}
 child.returnOffset=new T.Vector3();child.path=new T.LineLoop(new T.BufferGeometry().setFromPoints(Array.from({length:97},()=>new T.Vector3())),new T.LineBasicMaterial({color:0x999999,transparent:true,opacity:.22}));scene.add(child.path);reserve(root(parent),bodies);
 const target=parent.group.position.clone().add(new T.Vector3(Math.cos(child.phase)*child.shell,Math.sin(child.phase)*child.shell*.97,Math.sin(child.phase)*child.shell*child.inclination));
 if(immediate)move(child,target.clone().sub(child.group.position),bodies);else child.returnOffset.copy(child.group.position).sub(target);
 return child;
}
export function capture(a,b,bodies,scene){let ra=root(a),rb=root(b);if(ra===rb)return;const na=members(ra,bodies).length,nb=members(rb,bodies).length;let parent=na!==nb?(na>nb?a:b):(a.links!==b.links?(a.links>b.links?a:b):(a.radius>=b.radius?a:b));return attach(root(parent)===ra?rb:ra,parent,bodies,scene)}
export function update(bodies,dt){for(const b of bodies){b.baseRadius??=b.radius;b.radius+=(b.baseRadius*(1+Math.min(.65,(b.links||0)*.11))-b.radius)*(1-Math.exp(-dt*4));b.mass=b.radius**3;b.group.scale.setScalar(b.radius)}
for(const b of bodies.filter(x=>!x.parent))reserve(b,bodies);
function visit(p){p.orbitClock=(p.orbitClock||0)+dt;for(const b of children(p,bodies)){if(p.compactSystem)b.phase=p.orbitClock*.09+(b.compactSlot%4)*Math.PI/2;else b.phase+=dt*b.speed;const target=p.group.position.clone().add(new T.Vector3(Math.cos(b.phase)*b.shell,Math.sin(b.phase)*b.shell*.97,Math.sin(b.phase)*b.shell*b.inclination));if(b.held)b.returnOffset=b.group.position.clone().sub(target);else{b.returnOffset?.multiplyScalar(Math.exp(-dt*4));move(b,target.add(b.returnOffset||new T.Vector3()).sub(b.group.position),bodies)}visit(b)}}
for(const b of bodies.filter(x=>!x.parent))visit(b);
// Translate whole systems when they meet; preserve the parent-relative orbit.
const roots=bodies.filter(x=>!x.parent);for(let pass=0;pass<24;pass++){let changed=false;for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++){const a=roots[i],b=roots[j];if(a.locked&&b.locked)continue;const v=b.group.position.clone().sub(a.group.position),d=v.length(),min=extent(a,bodies)+extent(b,bodies)+.5;if(d<min&&!a.armed&&!b.armed&&!a.held&&!b.held){v.setLength(1);if(!d)v.set(1,0,0);v.multiplyScalar((min-d)*.5+.001);move(a,v.clone().negate(),bodies);move(b,v,bodies);changed=true}}if(!changed)break}
// Final hard constraint includes locks, held bodies, growth and returning satellites.
for(let pass=0;pass<64;pass++){let changed=false;for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const a=bodies[i],b=bodies[j],v=b.group.position.clone().sub(a.group.position),d=v.length(),min=a.radius+b.radius+.02;if(d<min){if(d)v.divideScalar(d);else v.set(1,0,0);v.multiplyScalar((min-d)*.5+.00001);a.group.position.sub(v);b.group.position.add(v);changed=true}}if(!changed)break}
for(const b of bodies.filter(x=>x.parent)){const arr=b.path.geometry.attributes.position;for(let i=0;i<arr.count;i++){const t=i/(arr.count-1)*Math.PI*2;arr.setXYZ(i,b.parent.group.position.x+Math.cos(t)*b.shell,b.parent.group.position.y+Math.sin(t)*b.shell*.97,b.parent.group.position.z+Math.sin(t)*b.shell*b.inclination)}arr.needsUpdate=true;b.path.geometry.computeBoundingSphere()}}
