"""Export existing pair responses only. Does not import the API client or make requests."""
import hashlib,json,pathlib,re
seeds=json.loads(pathlib.Path('seed.json').read_text())
question={'link':{'type':'noul','instructions':'Is there a publicly documented partnership, integration, investment, acquisition or customer relationship between these exact companies? Cite direct evidence mentioning both. Absence of evidence is not evidence of rivalry.'}}
fixtures={}
for a in seeds:
 for b in seeds:
  if a==b:continue
  state={k:{f:c[f] for f in ('name','domain')} for k,c in [('a',a),('b',b)]}
  key=hashlib.sha256(json.dumps({'state':state,'questions':question},sort_keys=True).encode()).hexdigest()[:24]
  path=pathlib.Path('.cache')/(key+'.json')
  if not path.exists():continue
  d=json.loads(path.read_text());cites=[]
  for c in d.get('citations',[]):
   text=' '.join([c.get('title',''),*c.get('excerpts',[])]).lower()
   if all(re.search(r'(?<!\w)'+re.escape(x['name'].lower())+r'(?!\w)',text) for x in (a,b)):cites.append(c)
  fixtures['|'.join(sorted([a['name'],b['name']]))]={'p':d['answers']['link']['noul'],'citations':cites,'cacheFile':path.name}
pathlib.Path('pair-fixtures.json').write_text(json.dumps(fixtures,indent=2))
for k,v in fixtures.items():
 if 'Microsoft' in k or k in ('Stripe|Tesla','OpenAI|Stripe'):print(k,v['p'],len(v['citations']))
