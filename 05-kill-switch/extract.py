import json,pathlib,collections
HERE=pathlib.Path(__file__).resolve().parent
d=json.loads((HERE.parent/'01-recon/blast_raw.json').read_text())
edges=[]
for e in d['edges']:
 c=d['raw'].get(e['company']+'|'+e['vendor'],{}).get('citations',[])
 c=[{'url':x['url'],'title':x.get('title','Source'),'excerpts':[str(t)[:600] for t in x.get('excerpts',[])[:2]]} for x in c if x.get('url','').startswith(('http://','https://'))]
 if (e.get('p') or 0)>.6 and c: edges.append({**{k:e[k] for k in ('company','vendor','p')},'citations':c})
seed={'companies':[{'name':n,'verified':True} for n in dict.fromkeys(e['company'] for e in d['edges'])],'vendors':list(dict.fromkeys(e['vendor'] for e in d['edges'])),'edges':edges}
(HERE/'seed.json').write_text(json.dumps(seed))
print(len(seed['companies']),len(seed['vendors']),len(edges),collections.Counter(e['vendor'] for e in edges).most_common())
