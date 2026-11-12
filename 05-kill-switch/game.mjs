export const HARDENED_VENDORS = ['AWS','Google Cloud','Microsoft Azure','Azure'];
export const eligible = e => e.p > .6 && e.citations?.some(c=>/^https?:\/\//.test(c.url));
export const initial = (round=1,limit=3) => ({cuts:[],down:[],round,limit,locked:round===2?HARDENED_VENDORS:[]});
export function cut(state,vendor,edges){
 if(state.locked.includes(vendor)||state.cuts.length>=state.limit||state.cuts.includes(vendor))return state;
 const cuts=[...state.cuts,vendor];
 return {...state,cuts,down:[...new Set(edges.filter(e=>eligible(e)&&cuts.includes(e.vendor)).map(e=>e.company))]};
}
export function bestCuts(vendors,edges,count=3,locked=[]){
 const available=vendors.filter(v=>!locked.includes(v));let best={score:0,vendors:[],ties:0};
 const names=[...new Set(edges.filter(eligible).map(e=>e.company))];const masks=available.map(v=>edges.filter(e=>eligible(e)&&e.vendor===v).reduce((m,e)=>m|(1n<<BigInt(names.indexOf(e.company))),0n));
 function visit(start,vs,mask){if(vs.length===Math.min(count,available.length)){let score=0;for(let m=mask;m;m&=m-1n)score++;if(score>best.score||!best.ties)best={score,vendors:vs,ties:1};else if(score===best.score)best.ties++;return;}for(let i=start;i<available.length;i++)visit(i+1,[...vs,available[i]],mask|masks[i]);}visit(0,[],0n);return best;
}
export const bestTriple=(vendors,edges)=>bestCuts(vendors,edges);
export function hardenedRound(data){for(const limit of [3,2,1]){const best=bestCuts(data.vendors,data.edges,limit,HARDENED_VENDORS);if(best.ties<=3||limit===1)return {limit,best};}}

export function balancedRound(data,round=1){const locked=round===2?HARDENED_VENDORS:[];for(const limit of [3,2,1]){const best=bestCuts(data.vendors,data.edges,limit,locked);if(best.ties<=3||limit===1)return {limit,best};}}
