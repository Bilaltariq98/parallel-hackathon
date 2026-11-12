import audience_server as a
for domain in ['acme.com','sub.acme.co.uk','WWW.ACME.COM']:
 assert a.validate({'name':'Acme','domain':domain})[1]==domain.lower().removeprefix('www.')
for domain in ['127.0.0.1','localhost','a.local','https://acme.com','acme.com/x','a..com','-a.com','a.com:80','a'*64+'.com']:
 try:a.validate({'name':'Acme','domain':domain})
 except ValueError:pass
 else:raise AssertionError(domain)
try:a.validate({'name':'<b>Acme</b>','domain':'acme.com'})
except ValueError:pass
else:raise AssertionError('Markup accepted')
assert (a.MAX_COMPANIES,a.SUBMISSIONS_PER_MINUTE,a.MAX_RESEARCH_JOBS,a.MAX_API_INFLIGHT)==(60,3,2,8)
assert a.JOBS.acquire(False) and a.JOBS.acquire(False) and not a.JOBS.acquire(False)
a.JOBS.release();a.JOBS.release()
import urllib.request,urllib.error,json
try:urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:4104/api/remove',b'{"domain":"acme.com"}',{'Content-Type':'application/json'}))
except urllib.error.HTTPError as e:assert e.code==403
else:raise AssertionError('Unauthorised removal allowed')
print('Validation, named caps, research semaphore, unauthorised removal: PASS')
