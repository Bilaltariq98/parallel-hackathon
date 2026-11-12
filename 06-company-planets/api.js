async function responseError(r){const body=await r.json().catch(()=>({}));const error=Error(body.error||'Research unavailable. Please try again later.');error.status=r.status;error.code=body.code;return error}
export async function post(path,data){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw await responseError(r);return r.json()}
export async function research(data,onFact,{onPair=()=>{},onFactsComplete=()=>{}}={}){
 const r=await fetch('/api/company',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw await responseError(r);
 const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
 function event(line){if(!line.trim())return;const f=JSON.parse(line);if(f.type==='pair')onPair(f);else if(f.type==='facts_complete')onFactsComplete();else if(f.key)onFact(f.key,f.fact)}
 while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)event(line)}
 buffer+=decoder.decode();event(buffer);
}
