import {seedLayout} from './seed-layout.mjs';
import {installFormation} from './formation.js';
import * as T from 'three';
import {DragControls} from './vendor/DragControls.js';
import {planet} from './planet.js';
import {mapping,fact,verified,outcome,relationship,sourceTitle} from './state.mjs';
import {step} from './physics.js';
import {capture,attach,update,move,root,extent,members} from './orbit-system.js';
import {post,research} from './api.js';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,2000),renderer=new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1);renderer.setClearColor('#101010');document.body.prepend(renderer.domElement);
const bodies=[],proxies=[],links=[],pending=[],results=new Map(),frames=[];
const caption=document.querySelector('#caption'),evidence=document.createElement('aside');evidence.id='evidence';document.body.append(evidence);
let paused=false,dither=0,focusBody=null,focusUntil=0,cameraReady=false,dragging=false,selectedBody=null,selectedPair=null,focusedPair=null;
function size(){renderer.setSize(innerWidth-320,innerHeight);camera.aspect=(innerWidth-320)/innerHeight;camera.updateProjectionMatrix()}
size();addEventListener('resize',size);
function add(c){const b=planet(c);b.id=bodies.length;b.baseRadius=b.radius;b.links=0;b.armed=0;b.velocity.set(0,0,0);b.group.position.set((b.id%5-2)*8,(1-Math.floor(b.id/5))*7,0);scene.add(b.group);b.proxy=new T.Mesh(new T.SphereGeometry(1,16,12),new T.MeshBasicMaterial({visible:false}));b.proxy.userData.body=b;scene.add(b.proxy);proxies.push(b.proxy);b.label=document.createElement('button');b.label.className='label';b.label.onclick=()=>sheet(b);document.querySelector('#labels').append(b.label);bodies.push(b);return b}
function sheet(b){selectedBody=b.id;selectedPair=null;const el=document.querySelector('#sheet');el.hidden=false;el.replaceChildren();const close=document.createElement('button');close.textContent='Close ×';close.onclick=()=>{el.hidden=true;selectedBody=null;selectedPair=null};el.append(close);const h=document.createElement('h2');h.textContent=b.c.name;el.append(h);const heading=document.createElement('h3');heading.textContent=`${b.links} documented links`;el.append(heading);for(const l of links.filter(l=>l.a===b||l.b===b)){const other=l.a===b?l.b:l.a,entry=document.createElement('section');entry.className='connection';const button=document.createElement('button');button.textContent=other.c.name+(b.parent===other?' · home orbit':'');button.onclick=()=>focusLink(l);const excerpt=document.createElement('p');excerpt.textContent=l.rel.sentence;const source=document.createElement('a');source.href=l.rel.url;source.target='_blank';source.rel='noopener';source.textContent=sourceTitle(l.result.citations.find(c=>c.url===l.rel.url));entry.append(button,excerpt,source);el.append(entry)}for(const [k,label]of Object.entries(mapping)){const f=b.c.facts[k],state=fact(f,verified(b.c)),p=document.createElement('p');p.textContent=`${label}: ${state.answer} · ${state.confidence.toFixed(2)} `;for(const c of (f?.citations||[]).slice(0,1)){if(!/^https?:\/\//.test(c.url))continue;const a=document.createElement('a');a.href=c.url;a.target='_blank';a.rel='noopener';a.textContent=sourceTitle(c);p.append(a)}el.append(p)}}
const keyFor=(a,b)=>[a.c.domain,b.c.domain].sort().join('|');
function bounce(a,b){const v=b.group.position.clone().sub(a.group.position);if(!v.length())v.set(1,0,0);v.normalize();const ra=root(a),rb=root(b),av=ra.velocity.dot(v),bv=rb.velocity.dot(v),ma=ra.mass||1,mb=rb.mass||1;ra.velocity.addScaledVector(v,2*mb/(ma+mb)*(bv-av));rb.velocity.addScaledVector(v,2*ma/(ma+mb)*(av-bv));if(rb.velocity.clone().sub(ra.velocity).dot(v)<2){ra.velocity.addScaledVector(v,-1.5);rb.velocity.addScaledVector(v,1.5)}move(ra,v.clone().multiplyScalar(-.4),bodies);move(rb,v.clone().multiplyScalar(.4),bodies);const ring=new T.Mesh(new T.RingGeometry(.95,1,64),new T.MeshBasicMaterial({color:0xffffff,transparent:true}));ring.position.copy(a.group.position).add(b.group.position).multiplyScalar(.5);scene.add(ring);const start=performance.now();function ripple(now){const t=(now-start)/650;ring.scale.setScalar(1+t*7);ring.material.opacity=1-t;if(t<1)requestAnimationFrame(ripple);else{scene.remove(ring);ring.geometry.dispose();ring.material.dispose()}}requestAnimationFrame(ripple)}
async function collide(a,b){const key=keyFor(a,b);if(root(a)===root(b)||root(a).locked||root(b).locked)return;if(results.has(key)){a.armed=b.armed=0;caption.textContent=outcome(results.get(key))==='fuse'?'Already documented · click a planet to inspect its links':'no documented link found';bounce(a,b);return}const ra=root(a),rb=root(b);ra.locked=rb.locked=true;a.armed=b.armed=0;const mid=ra.group.position.clone().add(rb.group.position).multiplyScalar(.5),distance=extent(ra,bodies)+extent(rb,bodies)+1;const s={a:ra,b:rb,mid,distance,angle:Math.atan2(ra.group.position.y-rb.group.position.y,ra.group.position.x-rb.group.position.x)};pending.push(s);caption.textContent=`Checking ${a.c.name} × ${b.c.name}…`;
try{const [result]=await Promise.all([post('pair',{a:{name:a.c.name,domain:a.c.domain},b:{name:b.c.name,domain:b.c.domain}}),new Promise(r=>setTimeout(r,1050))]);results.set(key,result);if(outcome(result)==='fuse'){capture(a,b,bodies,scene);const rel=recordLink(a,b,result).rel;caption.textContent=`${a.c.name} ↔ ${b.c.name} · ${rel.type}`;}else{caption.textContent='no documented link found';bounce(a,b)}}catch(error){caption.textContent=error.message||'Research failed · fling again to retry';bounce(a,b)}finally{ra.locked=rb.locked=false;pending.splice(pending.indexOf(s),1)}}
function showEvidence(a,b,rel,result){const card=document.createElement('article');card.className='tether';const title=document.createElement('b');title.textContent=`${a.c.name} ↔ ${b.c.name} · ${rel.type}`;const desc=document.createElement('p');desc.textContent=rel.sentence;const source=document.createElement('a');source.href=rel.url;source.target='_blank';source.rel='noopener';source.textContent=sourceTitle(result.citations.find(c=>c.url===rel.url));card.append(title,desc,source);evidence.prepend(card)}
const drag=new DragControls(proxies,camera,renderer.domElement);let previous,lastTime,moved;
drag.addEventListener('dragstart',e=>{const b=e.object.userData.body;if(root(b).locked||b.forming)return;b.held=true;dragging=true;previous=e.object.position.clone();lastTime=performance.now();moved=false;b.velocity.set(0,0,0)});
drag.addEventListener('drag',e=>{const b=e.object.userData.body;if(!b.held)return;const now=performance.now(),delta=e.object.position.clone().sub(previous);b.velocity.copy(delta).multiplyScalar(1000/Math.max(16,now-lastTime)).clampLength(0,18);move(b,e.object.position.clone().sub(b.group.position),bodies);update(bodies,0);previous.copy(e.object.position);lastTime=now;moved=true});
drag.addEventListener('dragend',e=>{const b=e.object.userData.body;b.held=false;dragging=false;if(moved&&!b.parent){b.armed=2.5;if(b.velocity.length()<1)b.velocity.setLength(1)}if(!moved)sheet(b)});
function recordLink(a,b,result,{card=true}={}){
 const existing=links.find(l=>keyFor(l.a,l.b)===keyFor(a,b));if(existing)return existing;
 if(outcome(result)!=='fuse')return;
 a.links++;b.links++;const rel=relationship(result,a.c.name,b.c.name);
 const line=new T.Line(new T.BufferGeometry().setFromPoints([a.group.position,b.group.position]),new T.LineBasicMaterial({color:0x96f1a7,transparent:true,opacity:.5,depthWrite:false}));scene.add(line);
 const l={a,b,line,rel,result};links.push(l);if(card)showEvidence(a,b,rel,result);return l;
}
function focusLink(l){
 selectedBody=null;selectedPair=[l.a.id,l.b.id];focusedPair=l;focusUntil=performance.now()+5000;
 focusBody={group:{position:l.a.group.position.clone().add(l.b.group.position).multiplyScalar(.5)}};
 caption.textContent=`${l.a.c.name} ↔ ${l.b.c.name} · ${l.rel.type}`;
 const el=document.querySelector('#sheet');el.hidden=false;el.replaceChildren();const close=document.createElement('button');close.textContent='Close ×';close.onclick=()=>{el.hidden=true;selectedPair=null};
 const title=document.createElement('h2');title.textContent=`${l.a.c.name} ↔ ${l.b.c.name}`;const excerpt=document.createElement('p');excerpt.textContent=l.rel.sentence;
 const source=document.createElement('a');source.href=l.rel.url;source.target='_blank';source.rel='noopener';source.textContent=sourceTitle(l.result.citations.find(c=>c.url===l.rel.url));el.append(close,title,excerpt,source);
}
function screenPoint(position){const p=position.clone().project(camera);return {x:(p.x*.5+.5)*(innerWidth-320),y:(-p.y*.5+.5)*innerHeight}}
let linePress=null;
renderer.domElement.addEventListener('pointerdown',e=>linePress={x:e.clientX,y:e.clientY,body:dragging});
renderer.domElement.addEventListener('pointerup',e=>{
 if(!linePress||linePress.body||Math.hypot(e.clientX-linePress.x,e.clientY-linePress.y)>5)return;
 let closest=null,best=6;
 for(const l of links){const a=screenPoint(l.a.group.position),b=screenPoint(l.b.group.position),dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((e.clientX-a.x)*dx+(e.clientY-a.y)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(e.clientX-a.x-t*dx,e.clientY-a.y-t*dy);if(distance<best){best=distance;closest=l}}
 if(closest)focusLink(closest);linePress=null;
});
const seedCompanies=await(await fetch('seed.json')).json();for(const c of seedCompanies)add(c);
const seedData=await(await fetch('seed-links.json')).json();
for(const r of seedData.pairs){const a=bodies.find(b=>b.c.domain===r.a),b=bodies.find(b=>b.c.domain===r.b);if(!a||!b||!r.result)continue;results.set(keyFor(a,b),r.result);recordLink(a,b,r.result,{card:false})}
const layout=seedLayout(seedCompanies,seedData.pairs);
for(const b of bodies){b.radius=b.baseRadius*(1+Math.min(.65,b.links*.11));b.group.scale.setScalar(b.radius)}
layout.hubs.forEach((domain,i)=>{const b=bodies.find(b=>b.c.domain===domain);b.compactSystem=true;b.group.position.set((i-1)*36,i===1?24:-12,0)});
for(const [domain,parent]of layout.home)attach(bodies.find(b=>b.c.domain===domain),bodies.find(b=>b.c.domain===parent),bodies,scene,{immediate:true});
update(bodies,0);
caption.textContent=links.length?`${links.length} cited links · click a planet to explore its connections`:'Click a planet for facts · drag two together to test a hunch';

// Only copied values are exposed; browser tests cannot mutate the simulation.
Object.defineProperty(window,'planetTest',{value:Object.freeze({snapshot:()=>({bodies:bodies.map(b=>{const p=b.group.position.clone().project(camera);const scale=(innerHeight/2)/(Math.tan(Math.PI/8)*(camera.position.z-b.group.position.z));return {id:b.id,name:b.c.name,domain:b.c.domain,position:b.group.position.toArray(),radius:b.radius,links:b.links,parent:b.parent?.id??null,shell:b.shell||0,locked:!!root(b).locked,held:!!b.held,forming:!!b.forming,state:b.state||'ready',connectionsReady:!!b.connectionsReady,traits:b.decorations.map(d=>d.userData.key),visualVersion:b.visualVersion||0,screen:{x:(p.x*.5+.5)*(innerWidth-320),y:(-p.y*.5+.5)*innerHeight,r:b.radius*scale},velocity:b.velocity.toArray()}}),selectedBody,selectedPair,connections:links.map(l=>({a:l.a.id,b:l.b.id,p:l.result.p,url:l.rel.url,home:l.a.parent===l.b||l.b.parent===l.a,opacity:l.line.material.opacity,mid:screenPoint(l.a.group.position.clone().add(l.b.group.position).multiplyScalar(.5))})),links:links.length,pending:pending.length,frames:[...frames],formation:structuredClone(formationState)})})});
let formationState=null;
function fitCamera(dt){if(dragging)return;const active=focusBody&&performance.now()<focusUntil;if(active&&focusedPair)focusBody.group.position.copy(focusedPair.a.group.position).add(focusedPair.b.group.position).multiplyScalar(.5);if(!active)focusedPair=null;const target=active?focusBody.group.position.clone():new T.Vector3();let z=active?(focusedPair?Math.max(18,focusedPair.a.group.position.distanceTo(focusedPair.b.group.position)*2.2):15):38;if(!active){const min=new T.Vector3(Infinity,Infinity,Infinity),max=new T.Vector3(-Infinity,-Infinity,-Infinity);for(const b of bodies){const r=b.radius*2.1;min.min(b.group.position.clone().addScalar(-r));max.max(b.group.position.clone().addScalar(r))}target.copy(min).add(max).multiplyScalar(.5);const width=max.x-min.x,height=max.y-min.y;z=Math.max(35,height/(2*Math.tan(Math.PI/8)*.64),width/(2*Math.tan(Math.PI/8)*camera.aspect*.88))+max.z;}
const desired=target.clone().add(new T.Vector3(0,0,z));if(!cameraReady){camera.position.copy(desired);cameraReady=true}else camera.position.lerp(desired,active?1-Math.exp(-dt*4):(focusBody?1-Math.exp(-dt*2):1));if(!active&&camera.position.distanceTo(desired)<.1)focusBody=null;camera.lookAt(active?target:target);camera.updateMatrixWorld()}
let last=performance.now();function frame(now){requestAnimationFrame(frame);const elapsed=(now-last)/1000,dt=Math.min(.033,elapsed);last=now;frames.push(elapsed);if(frames.length>600)frames.shift();if(!paused){step(bodies,dt,collide);for(const s of pending){s.angle+=dt*.8;const off=new T.Vector3(Math.cos(s.angle),Math.sin(s.angle),0).multiplyScalar(s.distance/2);move(s.a,s.mid.clone().add(off).sub(s.a.group.position),bodies);move(s.b,s.mid.clone().sub(off).sub(s.b.group.position),bodies)}}update(bodies,paused?0:dt);fitCamera(dt);
for(const l of links){const home=l.a.parent===l.b||l.b.parent===l.a,highlight=selectedBody!==null?(l.a.id===selectedBody||l.b.id===selectedBody):selectedPair?selectedPair.includes(l.a.id)&&selectedPair.includes(l.b.id):false;l.line.material.opacity=highlight?1:(selectedBody!==null||selectedPair?.length)? .025:home?.65:.055;const attr=l.line.geometry.attributes.position;attr.setXYZ(0,...l.a.group.position.toArray());attr.setXYZ(1,...l.b.group.position.toArray());attr.needsUpdate=true;l.line.geometry.computeBoundingSphere()}
const occupied=[];for(const b of [...bodies].sort((a,b)=>Number(!!a.parent)-Number(!!b.parent)||b.links-a.links)){b.proxy.position.copy(b.group.position);b.proxy.scale.setScalar(b.radius);b.mesh.rotation.y+=dt*.08;b.mat.uniforms.dither.value=dither;for(const d of b.decorations)d.scale.lerp(d.userData.targetScale,1-Math.exp(-dt*7));const p=b.group.position.clone();p.y-=b.radius+.2;p.project(camera);b.label.style.left=(p.x*.5+.5)*(innerWidth-320)+'px';b.label.style.top=(-p.y*.5+.5)*innerHeight+'px';b.label.textContent=`${b.c.name} · ${b.links} links`+(b.forming&&b.state==='researching'?' · FORMING':verified(b.c)?'':' · UNVERIFIED');b.label.style.display='';const box=b.label.getBoundingClientRect();if(box.top<100||box.bottom>innerHeight-175||box.right>innerWidth-320||box.left<4||occupied.some(r=>box.left<r.right&&box.right>r.left&&box.top<r.bottom&&box.bottom>r.top))b.label.style.display='none';else occupied.push(box)}
const largest=bodies.filter(b=>!b.parent).sort((a,b)=>members(b,bodies).length-members(a,bodies).length||b.links-a.links)[0];document.querySelector('#score').textContent=`${links.length} links discovered\nLargest system: ${largest.c.name} (${members(largest,bodies).length})`;document.querySelector('#fps').textContent=` · ${Math.round(frames.length/frames.reduce((a,b)=>a+b,0))} FPS`;renderer.setViewport(0,0,innerWidth-320,innerHeight);renderer.setScissor(0,0,innerWidth-320,innerHeight);renderer.setScissorTest(true);renderer.render(scene,camera)}requestAnimationFrame(frame);
addEventListener('keydown',e=>{if(e.target.matches('input'))return;if(e.code==='Space'){paused=!paused;e.preventDefault()}if(e.key.toLowerCase()==='d')dither=1-dither});
function freePosition(){
 const roots=bodies.filter(b=>!b.parent);const x=Math.max(...roots.map(b=>b.group.position.x+extent(b,bodies)),...bodies.map(b=>b.group.position.x+b.radius*2.05))+7;
 return new T.Vector3(x,0,0);
}
installFormation({bodies,add,freePosition,focus:(b,ms)=>{focusBody=b;focusedPair=null;focusUntil=performance.now()+ms},join:connectAdded,sheet,caption,setState:s=>formationState=s});

async function connectAdded(b,checks,expected){
 const cited=[];for(const check of checks){const other=bodies.find(x=>x.c.domain===check.domain);if(!other||!check.result)continue;results.set(keyFor(b,other),check.result);const l=recordLink(b,other,check.result,{card:false});if(l)cited.push({other,l,p:check.result.p})}
 cited.sort((a,b)=>b.p-a.p||b.other.links-a.other.links||a.other.c.name.localeCompare(b.other.c.name));
 if(cited.length){const best=cited[0];if(!b.parent)attach(b,best.other,bodies,scene);showEvidence(b,best.other,best.l.rel,best.l.result);caption.textContent=`${b.c.name} found ${cited.length} documented links · home orbit: ${best.other.c.name}`}
 else caption.textContent=checks.length<expected||checks.some(c=>c.error)?'Relationship checks unavailable · try a manual hunch later':'no documented link found';
 b.connectionsReady=true;b.velocity.set(0,0,0);focusUntil=0;
}
