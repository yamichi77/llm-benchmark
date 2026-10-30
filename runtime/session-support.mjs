import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
export const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export const optionalJson=async file=>{try{return await readJson(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
export const writeJson=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2));
export function rateLimitInfo(events,stderr='',now=Date.now()){
 const errors=events.filter(e=>e.type==='error'||e.type==='turn.failed'||e.is_error||e.error);
 const text=JSON.stringify(errors)+'\n'+stderr;
 if(!/(rate_limit_error|rate_limit_exceeded|usage_limit_reached|usage limit|usage cap|hit your limit|hit your usage limit|rate limit|too many requests|\b429\b)/i.test(text))return null;
 let retryAt=null;
 function walk(value){if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){
  if(/^(resets_at|reset_at|retry_at|retryAt|resetsAt|resetAt)$/.test(key)){const n=typeof v==='number'?(v<1e12?v*1000:v):Date.parse(v);if(Number.isFinite(n)&&n>now)retryAt=new Date(n).toISOString();}
  if(/^(retry_after|retry_after_seconds)$/.test(key)&&Number.isFinite(Number(v))&&Number(v)>0)retryAt=new Date(now+Number(v)*1000).toISOString();
  if(v&&typeof v==='object')walk(v);
 }}walk(events);
 if(!retryAt){const m=text.match(/(?:try again (?:at|after)|resets? (?:at|on)|retry[_ -]?at)[^\d]{0,20}(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d))/i);if(m&&Date.parse(m[1])>now)retryAt=new Date(m[1]).toISOString();}
 return {reason:'provider-rate-limit',retryAt,retryTimeKnown:!!retryAt};
}
export async function streamCommand(command,args,{cwd=process.cwd(),env=process.env,stdin='',prefix,onEvent=()=>{}}={}){
 const out=createWriteStream(prefix+'.stdout.jsonl',{flags:'wx'}),err=createWriteStream(prefix+'.stderr.log',{flags:'wx'});
 const p=spawn(command,args,{cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 let buffer='',stderr='',events=[],spawnError=null;
 function line(text){try{const e=JSON.parse(text);events.push(e);onEvent(e);}catch{/* Non-JSON output remains in the raw log. */}}
 p.stdout.on('data',b=>{out.write(b);buffer+=b.toString();let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i));buffer=buffer.slice(i+1);}});
 p.stderr.on('data',b=>{err.write(b);stderr=(stderr+b.toString()).slice(-2000000);});
 p.stdin.on('error',()=>{});p.stdin.end(stdin);
 const stop=()=>p.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const code=await new Promise(resolve=>{p.on('error',e=>{spawnError=e.message;});p.on('close',resolve);});
 if(buffer)line(buffer);await Promise.all([new Promise(r=>out.end(r)),new Promise(r=>err.end(r))]);
 process.off('SIGINT',stop);process.off('SIGTERM',stop);
 return {code,events,stderr,spawnError};
}
export function resumeDecision(state,{resume=false,restart=false,now=Date.now()}={}){
 if(state?.status==='success')return 'skip';
 if(!state)return 'new';
 if(state.status!=='rate-limited')return 'stop';
 if(!resume)return 'stop';
 if(state.retryAt&&Date.parse(state.retryAt)>now)return 'wait';
 if(state.resumeAvailable&&state.sessionId)return 'continue';
 return restart?'restart':'needs-restart-approval';
}
