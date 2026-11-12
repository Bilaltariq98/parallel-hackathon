export const mapping={uk_hq:'Polar cap',us_hq:'Equatorial ridge',public:'Latitude grid',consumer:'Oceans',software:'Latitude grid',hardware:'Moon',finance:'Armour',food:'Garden belt',fashion:'Striped terrain',auto_aero:'Satellite',energy_pharma:'Hot core',pre_1950:'Craters',post_2005:'Broad rings',over_100k:'Dense cities',trillion:'Outer halo',founder_ceo:'Beacon',ai:'Night lights',europe:'Northern band',asia:'Southern band',retail_stores:'Trading ports'};
export const hash=s=>[...s.toLowerCase()].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);
export const safeURL=u=>{try{let x=new URL(u);return ['http:','https:'].includes(x.protocol)?x.href:null}catch{return null}};
export function verified(c){return Object.values(c.facts).some(f=>f.citations?.some(s=>{try{let h=new URL(s.url).hostname;return h===c.domain||h.endsWith('.'+c.domain)}catch{return false}}))}
export function fact(f,ok){let p=f?.p;let confidence=typeof p==='number'?Math.max(p,1-p):0;return {confidence,answer:ok&&confidence>=.6&&f?.citations?.some(c=>safeURL(c.url))?(p>=.5?'yes':'no'):'unknown'}}
export function outcome(r){return r?.p>.6&&r.citations?.some(c=>safeURL(c.url))?'fuse':'bounce'}

export function traits(c){const yes=k=>fact(c.facts[k],verified(c)).answer==='yes';return {rings:yes('post_2005'),moons:Number(yes('hardware'))+Number(yes('auto_aero')),surface:yes('finance')?'plated':yes('pre_1950')?'cratered':yes('consumer')?'stormy':yes('public')?'banded':'smooth',lights:yes('ai'),radius:yes('over_100k')?1.65:yes('trillion')?1.25:.85};}
export function relationship(r,a,b){
 const sources=(r.citations||[]).filter(c=>safeURL(c.url));
 for(const c of sources){for(const raw of c.excerpts||[]){
 const cleaned=raw.replace(/<[^>]*>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\b\S*(?:_|\.html?|EX-\d)\S*\b/gi,' ').replace(/https?:\/\/\S+/g,' ');
 for(let sentence of cleaned.split(/(?<=[.!?])\s+|[\n\r]+|\s[*#•]\s/)){
 sentence=sentence.replace(/^[\s*#•\d.-]+/,'').replace(/\s+/g,' ').trim();
 const t=sentence.toLowerCase();
 if(!/[.!?]$/.test(sentence)||sentence.length<15||!t.includes(a.toLowerCase())||!t.includes(b.toLowerCase())||/\b(not|no|rumou?r|could|may|might|rivals?|rivalry|competitors?|talking|discussed|discussing|ticker|pointing|decrease|exploring|explores|rejected|rejects|denied|denies|talks|planned|plans|potential|considering|overtures|cookie|copyright|country.code)\b/.test(t))continue;
 let type='documented link';for(const [name,re] of [['acquisition',/acquir(?:ed|es|ing)|acquisition/],['investment',/invest(?:ed|ment|s)|funding/],['partnership',/partner(?:ship|ed|s)/],['integration',/integrat(?:ion|ed|es)/],['customer',/is a customer|as a customer|uses|powered by/]])if(re.test(t)){type=name;break}
 return {type,sentence:sentence.length>230?sentence.slice(0,227).replace(/\s+\S*$/,'')+'…':sentence,url:c.url};
 }}}
 return {type:'documented link',sentence:'',url:sources[0]?.url};
}

export function sourceTitle(c){return c?.title&&!/rival|competitor/i.test(c.title)?c.title:'Read cited source ↗'}
