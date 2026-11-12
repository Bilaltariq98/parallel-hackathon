import {outcome} from './state.mjs';
export function seedLayout(companies,records){
 const valid=records.filter(r=>outcome(r.result)==='fuse');
 const degree=new Map(companies.map(c=>[c.domain,0]));for(const r of valid){degree.set(r.a,(degree.get(r.a)||0)+1);degree.set(r.b,(degree.get(r.b)||0)+1)}
 const ranked=[...companies].sort((a,b)=>degree.get(b.domain)-degree.get(a.domain)||a.name.localeCompare(b.name));
 const hubs=ranked.filter(c=>degree.get(c.domain)>0).slice(0,Math.min(3,Math.ceil(companies.length/5))),home=new Map(),counts=new Map(hubs.map(c=>[c.domain,0]));
 const eligible=c=>hubs.filter(h=>valid.some(r=>[r.a,r.b].includes(c.domain)&&[r.a,r.b].includes(h.domain))).length;
 for(const c of ranked.filter(c=>!counts.has(c.domain)).sort((a,b)=>eligible(a)-eligible(b)||degree.get(b.domain)-degree.get(a.domain)||a.name.localeCompare(b.name))){const candidates=hubs.filter(h=>counts.get(h.domain)<4&&valid.some(r=>[r.a,r.b].includes(c.domain)&&[r.a,r.b].includes(h.domain)));
 candidates.sort((a,b)=>degree.get(b.domain)-degree.get(a.domain)||counts.get(a.domain)-counts.get(b.domain)||a.name.localeCompare(b.name));
 if(candidates.length){home.set(c.domain,candidates[0].domain);counts.set(candidates[0].domain,counts.get(candidates[0].domain)+1)}
 }
 return {degree,home,hubs:hubs.map(c=>c.domain)};
}
