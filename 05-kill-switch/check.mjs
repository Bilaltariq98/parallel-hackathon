import assert from 'node:assert/strict';
import {initial,cut,bestTriple,eligible} from './game.mjs';
const e=(company,vendor,p=.9)=>({company,vendor,p,citations:[{url:'https://example.com'}]});
const edges=[e('A','x'),e('B','x'),e('B','y'),e('C','z'),e('D','w',.6),{...e('E','w'),citations:[]}];
const start=initial(),one=cut(start,'x',edges);assert.deepEqual(start,initial());assert.equal(one.down.length,2);assert.equal(cut(one,'x',edges),one);assert.equal(eligible(edges[4]),false);assert.equal(eligible(edges[5]),false);assert.equal(bestTriple(['x','y','z','w'],edges).score,3);let end=cut(cut(one,'y',edges),'z',edges);assert.equal(cut(end,'w',edges),end);assert.equal(end.down.length,3);console.log('Scoring, threshold, citation, immutability, three-cut limit and optimum: PASS');
const {bestCuts,hardenedRound,HARDENED_VENDORS}=await import('./game.mjs');
const locked=initial(2,2);assert.equal(cut(locked,'AWS',edges),locked);let two=cut(cut(locked,'x',edges),'z',edges);assert.equal(cut(two,'y',edges),two);assert.equal(bestCuts(['x','y','z'],edges,2,['x']).score,2);
const data=JSON.parse((await import('node:fs')).readFileSync(new URL('./seed.json',import.meta.url)));const r=hardenedRound(data);assert.ok(r.limit>=1&&r.limit<=3);assert.ok(r.best.score<=data.companies.length);assert.ok(r.best.ties>=1);assert.ok(r.best.vendors.every(v=>!HARDENED_VENDORS.includes(v)));console.log('Locked vendors, two-cut limit, restricted optimum: PASS',r);

const {balancedRound}=await import("./game.mjs");for(const round of [1,2]){const r=balancedRound(data,round);let s=initial(round,r.limit);for(const v of r.best.vendors)s=cut(s,v,data.edges);assert.equal(s.down.length,r.best.score);assert.equal(bestCuts(data.vendors,data.edges,r.limit,s.locked).ties,r.best.ties);console.log({round,...r});}
