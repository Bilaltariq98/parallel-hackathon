export async function seed(){const r=await fetch('./seed.json');if(!r.ok)throw Error('Seed could not load');return r.json()}
export async function addCompany(name,domain){const r=await fetch('/api/company',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,domain})});const d=await r.json();if(!r.ok)throw Error(d.error);return d}
