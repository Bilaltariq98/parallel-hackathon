import assert from 'node:assert/strict';
import fs from 'node:fs';
const nodes=new Map();
function element(){return {children:[],set id(v){nodes.set('#'+v,this)},setAttribute(){},append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},remove(){}}}
globalThis.document={querySelector:s=>nodes.get(s),createElement:element,body:element()};
const {researchResult}=await import('./hud.js');
const result=JSON.parse(fs.readFileSync(new URL('./incident-check.json',import.meta.url)));
researchResult(result.company.name,'Cited dependencies found',result.edges);
const panel=nodes.get('#research-result');
assert.equal(panel.children[1].textContent,'incident.io');
assert.equal(panel.children.length,3+result.edges.length);
assert(result.edges.length>0);
researchResult('No results','No dependencies met the evidence threshold.');
assert.equal(panel.children[2].textContent,'No dependencies met the evidence threshold.');
console.log(`Incident.io result panel: ${result.edges.length} dependency buttons; empty result message: PASS`);
