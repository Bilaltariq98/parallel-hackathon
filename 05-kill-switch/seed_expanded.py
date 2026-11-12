"""Resumable, eight-worker seed build. Never replaces seed.json automatically."""
import sys
sys.dont_write_bytecode=True
import server,json,time,random,threading,concurrent.futures,urllib.parse,fcntl
from datetime import datetime,timezone
H=server.HERE
lockfile=open(H/'.seed-lock','w');fcntl.flock(lockfile,fcntl.LOCK_EX|fcntl.LOCK_NB)
rows='''Monzo|monzo.com
Revolut|revolut.com
Wise|wise.com
GoCardless|gocardless.com
Starling Bank|starlingbank.com
Barclays|barclays.co.uk
Lloyds Banking Group|lloydsbankinggroup.com
Tesco|tesco.com
ASOS|asos.com
Ocado|ocado.com
Deliveroo|deliveroo.co.uk
Octopus Energy|octopus.energy
HSBC|hsbc.com
NatWest|natwest.com
Santander|santander.co.uk
Nationwide|nationwide.co.uk
Zopa|zopa.com
OakNorth|oaknorth.com
Tide|tide.co
ClearBank|clear.bank
Checkout.com|checkout.com
SumUp|sumup.com
Klarna|klarna.com
Adyen|adyen.com
Mollie|mollie.com
Sainsbury's|sainsburys.co.uk
Marks and Spencer|marksandspencer.com
John Lewis|johnlewis.com
Waitrose|waitrose.com
Boots|boots.com
Next|next.co.uk
Dunelm|dunelm.com
Kingfisher|kingfisher.com
Gymshark|gymshark.com
Boohoo|boohoo.com
THG|thg.com
Trainline|thetrainline.com
Rightmove|rightmove.co.uk
Zoopla|zoopla.co.uk
Auto Trader|autotrader.co.uk
Just Eat|just-eat.co.uk
BrewDog|brewdog.com
easyJet|easyjet.com
British Airways|britishairways.com
Skyscanner|skyscanner.net
Spotify|spotify.com
Zalando|zalando.com
Vinted|vinted.com
Bolt|bolt.eu
Wolt|wolt.com
N26|n26.com
Qonto|qonto.com
Personio|personio.com
Celonis|celonis.com
Miro|miro.com
DeepL|deepl.com
ElevenLabs|elevenlabs.io
PolyAI|poly.ai
Synthesia|synthesia.io
Wayve|wayve.ai
Tessl|tessl.io
Parallel|parallel.ai
incident.io|incident.io
OpenAI|openai.com
Anthropic|anthropic.com
Mistral AI|mistral.ai
Hugging Face|huggingface.co
Stability AI|stability.ai
Cohere|cohere.com
Perplexity|perplexity.ai
Notion|notion.so
Figma|figma.com
Canva|canva.com
Shopify|shopify.com
Airbnb|airbnb.com
Uber|uber.com
Netflix|netflix.com
Duolingo|duolingo.com
Reddit|reddit.com
Zoom|zoom.us
Snyk|snyk.io
TrueLayer|truelayer.com
Paddle|paddle.com
Cleo|meetcleo.com
Marshmallow|marshmallow.com
Multiverse|multiverse.io
Freetrade|freetrade.io
Depop|depop.com
Thought Machine|thoughtmachine.net
Motorway|motorway.co.uk
Vercel|vercel.com
Ramp|ramp.com
Brex|brex.com
Mercury|mercury.com
Plaid|plaid.com
Retool|retool.com
Airtable|airtable.com
Rippling|rippling.com
Supabase|supabase.com
Replit|replit.com
Moneybox|moneyboxapp.com
Curve|curve.com
Zego|zego.com
Cuvva|cuvva.com
Lendable|lendable.co.uk
Zilch|zilch.com
Atom Bank|atombank.co.uk
Allica Bank|allica.bank
Funding Circle|fundingcircle.com
Wagestream|wagestream.com
PensionBee|pensionbee.com
Nutmeg|nutmeg.com
Yapily|yapily.com
Modulr|modulrfinance.com
Primer|primer.io
9fin|9fin.com
Quantexa|quantexa.com
ComplyAdvantage|complyadvantage.com
Darktrace|darktrace.com
Beamery|beamery.com
Unmind|unmind.com
Cera|ceracare.co.uk
Bloom & Wild|bloomandwild.com
Gousto|gousto.co.uk
Farfetch|farfetch.com
Lyst|lyst.com
ZOE|zoe.com
what3words|what3words.com
Citymapper|citymapper.com
Improbable|improbable.io
Sage|sage.com
Moonpig|moonpig.com
Tractable|tractable.ai
Faculty|faculty.ai
GoHenry|gohenry.com
Trading 212|trading212.com
Matillion|matillion.com
Blockchain.com|blockchain.com
Elliptic|elliptic.co
OVO Energy|ovoenergy.com
giffgaff|giffgaff.com
Carwow|carwow.co.uk
Treatwell|treatwell.co.uk
Perkbox|perkbox.com
Robin AI|robinai.com
Luminance|luminance.com
Hargreaves Lansdown|hl.co.uk
Raspberry Pi|raspberrypi.com
Duffel|duffel.com
Form3|form3.tech
Gusto|gusto.com
Deel|deel.com
Webflow|webflow.com
Zapier|zapier.com
Calendly|calendly.com
Loom|loom.com
Asana|asana.com
Dropbox|dropbox.com
Box|box.com
DoorDash|doordash.com
Instacart|instacart.com
Lyft|lyft.com
Robinhood|robinhood.com
Coinbase|coinbase.com
Chime|chime.com
Affirm|affirm.com
SoFi|sofi.com
Carta|carta.com
Gong|gong.io
Lattice|lattice.com
Grammarly|grammarly.com
Discord|discord.com
Pinterest|pinterest.com
Etsy|etsy.com
Peloton|onepeloton.com
Squarespace|squarespace.com
Mailchimp|mailchimp.com
HubSpot|hubspot.com
GitLab|gitlab.com
Postman|postman.com
Databricks|databricks.com
Scale AI|scale.com
Cursor|cursor.com
Harvey|harvey.ai
Glean|glean.com
Runway|runwayml.com
Substack|substack.com
Medium|medium.com
Quora|quora.com
Strava|strava.com
Calm|calm.com
Headspace|headspace.com
Flexport|flexport.com
Faire|faire.com
Docusign|docusign.com
Toast|toasttab.com
Wealthfront|wealthfront.com
Patreon|patreon.com
Vanta|vanta.com
Lemonade|lemonade.com'''
companies=[dict(zip(('name','domain'),s.split('|'))) for s in rows.splitlines()]
p=H/'seed-progress.json';state=json.loads(p.read_text()) if p.exists() else {'calls':0,'failures':0,'pairs':{}}
mutex=threading.Lock()
def save():
 tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(state));tmp.replace(p)
original=server.parallel.urllib.request.urlopen
def counted(*args,**kw):
 with mutex:
  if state['calls']>=6100:raise RuntimeError('Call budget reached')
  state['calls']+=1;save()
 try:return original(*args,**kw)
 except Exception:
  with mutex:state['failures']+=1;save()
  raise
server.parallel.urllib.request.urlopen=counted
# The shared client supplies retry/backoff; this wrapper adds longer jitter between exhausted transient retries.
def work(c,v):
 key=c['name']+'|'+v
 with mutex:
  if key in state['pairs']:return
 for attempt in range(3):
  try:
   edge=server.probe(c['name'],c['domain'],v)
   with mutex:state['pairs'][key]=edge;save()
   return
  except Exception as exc:
   if 'budget' in str(exc).lower():return
   if not any(s in str(exc) for s in ('429','HTTP 5','network')):return
   time.sleep(min(60,8*2**attempt)+random.uniform(0,4))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 futures=[pool.submit(work,c,v) for c in companies for v in server.VENDORS]
 for i,f in enumerate(concurrent.futures.as_completed(futures),1):
  f.result()
  if i%30==0:print(f'{i}/{len(futures)} pairs; {state["calls"]} calls; {state["failures"]} failed attempts',flush=True)
accepted=[];excluded=[];edges=[]
for c in companies:
 es=[state['pairs'].get(c['name']+'|'+v) for v in server.VENDORS];es=[e for e in es if e]
 def own(cite):
  host=urllib.parse.urlparse(cite['url']).hostname or ''
  return host==c['domain'] or host.endswith('.'+c['domain'])
 if any(own(cite) for e in es for cite in e['citations']):
  accepted.append({**c,'verified':True});edges.extend(e for e in es if e['p']>.6 and e['citations'])
 else:excluded.append(c['name'])
seed={'generated_at':datetime.now(timezone.utc).isoformat(),'companies':accepted,'vendors':server.VENDORS,'edges':edges,'excluded':excluded,'calls':state['calls'],'failed_attempts':state['failures'],'complete':len(state['pairs'])==len(companies)*len(server.VENDORS)}
(H/'seed-expanded.json').write_text(json.dumps(seed));print(json.dumps({k:v for k,v in seed.items() if k not in ('edges','vendors','companies')}),flush=True)
