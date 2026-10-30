import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {run,manifest,buildViewer} from './runner.mjs';import {optionalJson,resumeDecision} from './session-support.mjs';
const runtime=path.dirname(fileURLToPath(import.meta.url)),project=path.dirname(runtime);
// In-process lock: both lanes belong to this single coordinator. An exclusive
// campaign lock also prevents a second coordinator from starting duplicate trials.
export function serialResource(){let tail=Promise.resolve();return async fn=>{const before=tail;let release;tail=new Promise(r=>release=r);await before;try{return await fn();}finally{release();}};}
export async function compare({out=path.join(project,'results'),resume=false,wait=false,restart=false,retryPolicyRefusal=false,signal,onRun=run,configFiles=['config-opus.json','config-sol.json'].map(n=>path.join(runtime,'benchmarks/v2',n))}={}){
 const configs=await Promise.all(configFiles.map(f=>fs.readFile(f,'utf8').then(JSON.parse)));
 const privateRoot=path.join(out,'private');await fs.mkdir(privateRoot,{recursive:true});
 const lockPath=path.join(privateRoot,'comparison.lock');let lock;try{lock=await fs.open(lockPath,'wx');}catch(e){if(e.code==='EEXIST')throw Error('Comparison lock exists. Verify owner process before recovering it; no duplicate start.');throw e;}
 await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lock.close();
 const blender=serialResource(),publish=serialResource();let data=await optionalJson(path.join(out,'public/manifest.json'))||{results:[]};
 const records=()=>[...data.results,...data.excluded||[]];
 async function lane(config,configFile,mayResume=resume){const model=config.models[0];for(const task of config.tasks){if(signal?.aborted)return;const matches=records().filter(r=>r.task===task.id&&r.model===model.id&&r.promptVersion===task.promptVersion&&r.inputVersion===(task.inputVersion||null));
  if(matches.some(r=>r.status==='success')){console.log(task.id+' / '+model.id+': already complete');continue;}
  let prior=matches.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);let decision=resumeDecision(prior?{...prior,sessionId:prior.resumeSessionId}:null,{resume:mayResume,restart});
  if(retryPolicyRefusal&&prior?.failureCategory==='execution-policy-refusal'&&model.id==='gpt-6-astra-code'&&task.type==='model3d'&&model.args?.includes('--trial-write'))decision='policy-restart';
  if(decision==='wait'&&wait){const until=Date.parse(prior.retryAt);console.log(model.id+': paused until '+prior.retryAt);while(Date.now()<until){if(signal?.aborted)return;await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())));}decision=resumeDecision({...prior,sessionId:prior.resumeSessionId},{resume:mayResume,restart});}
  if(['stop','wait','needs-restart-approval'].includes(decision)){console.log(model.id+': '+decision+'; remaining tasks held');return;}
  const launch=async()=>{const result=await onRun(configFile,out,{signal,taskIds:[task.id],resumeTrial:decision==='continue'?prior:null,continuationMode:decision==='policy-restart'?'restart-after-policy-fix':decision==='restart'?'restart-after-rate-limit':'initial',publish:false,viewer:false});await publish(async()=>{data=await manifest(out);});return result;};
  if(task.type==='model3d')await blender(launch);else await launch();
  const newest=records().filter(r=>r.task===task.id&&r.model===model.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);
  if(newest?.status==='rate-limited'){
   if(wait&&newest.retryAt&&Date.parse(newest.retryAt)>Date.now()&&newest.resumeAvailable){prior=newest; // Continue the same lane only after the provider's future reset time.
    const until=Date.parse(newest.retryAt);while(Date.now()<until){if(signal?.aborted)return;await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())));}
    return lane({...config,tasks:config.tasks.slice(config.tasks.indexOf(task))},configFile,true);
   }
   console.log(model.id+': provider limit; reset '+(newest.retryAt||'unknown; explicit resume after checking reset'));return;
  }
  if(newest?.status!=='success'){console.log(model.id+': stopped after '+newest?.status+'; no quality retry');return;}
 }}
 try{await buildViewer(out);const outcomes=await Promise.allSettled(configs.map((c,i)=>lane(c,configFiles[i])));const failed=outcomes.find(x=>x.status==='rejected');if(failed)throw failed.reason;return data;}finally{await fs.unlink(lockPath);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
 const configIndex=process.argv.indexOf('--config');if(configIndex>=0&&!process.argv[configIndex+1])throw Error('--config requires a path');
 compare({...configIndex>=0?{configFiles:[path.resolve(process.argv[configIndex+1])]}:{},resume:process.argv.includes('--resume'),wait:process.argv.includes('--wait'),restart:process.argv.includes('--restart-rate-limited'),retryPolicyRefusal:process.argv.includes('--retry-policy-refusal'),signal:controller.signal}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
