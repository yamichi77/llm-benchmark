'use strict';
// Project-local, opt-in Node preload. Never logs request URLs, headers, bodies,
// free-text messages/stacks, host names, or arbitrary exception properties.
const fs=require('node:fs');
const path=require('node:path');
const logName='gemini-transport-errors.jsonl';
const codes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ECONNABORTED','EPIPE','ETIMEDOUT','ABORT_ERR','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','UND_ERR_ABORTED','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);
const names=new Set(['Error','TypeError','SystemError','FetchError','ApiError','AggregateError','DOMException','AbortError','TimeoutError','SocketError','ConnectTimeoutError','HeadersTimeoutError','BodyTimeoutError','RequestAbortedError']);
const categories=new Set(['dns','connection-reset','socket-closed','connection-refused','timeout','aborted','tls','http-payment-required','http-rate-limit','http-server','http-client','unknown']);
const get=(v,k)=>{try{return v?.[k];}catch{return undefined;}};
function safeError(error,seen=new Set(),depth=0){
 if(!error||typeof error!=='object'||seen.has(error)||depth>=4)return undefined;
 seen.add(error);const out={},name=get(error,'name'),code=get(error,'code'),errno=get(error,'errno'),status=get(error,'status')??get(error,'statusCode');
 out.name=names.has(name)?name:'UnknownError';if(codes.has(code))out.code=code;
 if(Number.isSafeInteger(errno)&&errno<0&&errno>=-100000)out.errno=errno;
 if(Number.isInteger(status)&&status>=100&&status<=599)out.status=status;
 const cause=safeError(get(error,'cause'),seen,depth+1);if(cause)out.cause=cause;
 const errors=get(error,'errors');if(Array.isArray(errors))out.errors=errors.slice(0,3).map(e=>safeError(e,seen,depth+1)).filter(Boolean);
 return out;
}
function category(error,status){
 if(status===402)return 'http-payment-required';if(status===429)return 'http-rate-limit';if(status>=500)return 'http-server';if(status>=400)return 'http-client';
 const flat=[];function visit(e){if(!e)return;flat.push(e);visit(e.cause);for(const a of e.errors||[])visit(a);}visit(error);
 if(flat.some(e=>['ENOTFOUND','EAI_AGAIN'].includes(e.code)))return 'dns';
 if(flat.some(e=>e.code==='ECONNRESET'))return 'connection-reset';
 if(flat.some(e=>e.code==='UND_ERR_SOCKET'))return 'socket-closed';
 if(flat.some(e=>e.code==='ECONNREFUSED'))return 'connection-refused';
 if(flat.some(e=>e.code==='ETIMEDOUT'||/TIMEOUT/.test(e.code||'')||['TimeoutError','ConnectTimeoutError','HeadersTimeoutError','BodyTimeoutError'].includes(e.name)))return 'timeout';
 if(flat.some(e=>['ABORT_ERR','UND_ERR_ABORTED','ECONNABORTED'].includes(e.code)||['AbortError','RequestAbortedError'].includes(e.name)))return 'aborted';
 if(flat.some(e=>['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(e.code)))return 'tls';return 'unknown';
}
function requestScope(input){
 try{const url=new URL(typeof input==='string'||input instanceof URL?input:get(input,'url'));return url.protocol==='https:'&&url.hostname==='generativelanguage.googleapis.com'?'gemini-api':'other';}catch{return 'other';}
}
function observedFetch(original,record){
 let sequence=0;
 return async function(input,init){
  const started=performance.now(),requestId=++sequence,scope=requestScope(input);
  const emit=value=>{try{record({version:1,timestamp:new Date().toISOString(),requestId,scope,elapsedMs:Math.max(0,Math.round(performance.now()-started)),...value});}catch{/* Diagnostics must not replace the original response/error. */}};
  let response;try{response=await Reflect.apply(original,this,[input,init]);}catch(error){const safe=safeError(error);emit({event:'fetch-error',category:category(safe),error:safe||{name:'UnknownError'}});throw error;}
  const status=get(response,'status');if(Number.isInteger(status)&&status>=400&&status<=599)emit({event:'http-error',category:category(null,status),status});
  return response;
 };
}
function payloadError(value,depth=0){
 if(depth>4||value==null)return false;
 if(typeof value==='string'){try{return payloadError(JSON.parse(value),depth+1);}catch{return false;}}
 if(typeof value!=='object')return false;
 if(value.isError===true||value.status==='error'||value.status==='failed')return true;
 for(const key of ['output','result','structuredContent'])if(payloadError(value[key],depth+1))return true;
 return Array.isArray(value.content)&&value.content.some(c=>c?.type==='text'&&payloadError(c.text,depth+1));
}
function summarizeToolResults(events){
 const results=events.filter(e=>e.type==='tool_result');let transportSuccess=0,transportErrors=0,inner=0,failed=0,clean=0,tracebacks=0;
 for(const e of results){const outer=e.status==='error',ok=e.status==='success',bad=payloadError(e.output)||payloadError(e.result);if(ok)transportSuccess++;if(outer)transportErrors++;if(bad)inner++;if(outer||bad)failed++;else if(ok)clean++;if(bad&&JSON.stringify(e.output??e.result).includes('Traceback (most recent call last)'))tracebacks++;}
 return {toolCalls:events.filter(e=>e.type==='tool_use').length,toolResults:results.length,transportSuccessfulToolResults:transportSuccess,transportErrorResults:transportErrors,mcpPayloadErrors:inner,failedToolResults:failed,successfulToolResults:clean,pythonTracebackResponses:tracebacks,unclassifiedToolResults:results.length-failed-clean};
}
function summarizeTransportLog(text){
 const summary={captureReady:false,privateLog:logName,errorCount:0,geminiApiErrorCount:0,otherFetchErrorCount:0,categoryCounts:{}};
 for(const line of text.split(/\r?\n/)){let r;try{r=JSON.parse(line);}catch{continue;}if(r.event==='capture-ready'){summary.captureReady=true;continue;}if(!['fetch-error','http-error'].includes(r.event)||!categories.has(r.category))continue;summary.errorCount++;if(r.scope==='gemini-api')summary.geminiApiErrorCount++;else summary.otherFetchErrorCount++;summary.categoryCounts[r.category]=(summary.categoryCounts[r.category]||0)+1;}
 return summary;
}
function install(){
 if(typeof globalThis.fetch!=='function')throw new Error('Gemini diagnostics require built-in fetch; no request started');
 const file=path.join(process.cwd(),logName);let fd;
 try{fd=fs.openSync(file,'wx',0o600);fs.writeSync(fd,JSON.stringify({version:1,event:'capture-ready',timestamp:new Date().toISOString()})+'\n');}catch{if(fd!==undefined)fs.closeSync(fd);throw new Error('Gemini diagnostics initialization failed; no request started');}
 let warned=false;const record=r=>{try{fs.writeSync(fd,JSON.stringify(r)+'\n');}catch{if(!warned){warned=true;process.stderr.write('Gemini diagnostics write failed; detailed cause not saved.\n');}}};
 globalThis.fetch=observedFetch(globalThis.fetch,record);
 process.once('exit',()=>{try{fs.closeSync(fd);}catch{}});
}
module.exports={logName,safeError,observedFetch,summarizeToolResults,summarizeTransportLog};
if(process.env.MODEL_BENCHMARK_GEMINI_DIAGNOSTICS==='1')install();
