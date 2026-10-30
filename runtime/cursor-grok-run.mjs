import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {streamCommand,writeJson,optionalJson,rateLimitInfo} from './session-support.mjs';
export const modelId='grok-4.7-high';
const version='2026.10.22-27dcf5f',base='C:/Users/PUBLIC_USER/AppData/Local/cursor-agent/versions/'+version;
const cliNode=path.join(base,'node.exe'),cli=path.join(base,'index.js');
export const permissionConfig=()=>({permissions:{allow:[],deny:['Read(**)','Write(**)','Shell(*)','WebFetch(*)','Mcp(*:*)']}});
export function argumentsFor(work){return [cli,'--print','--output-format','stream-json','--mode','ask','--model',modelId,'--workspace',work];}
export const approvedTrustTrial='C:/Users/PUBLIC_USER/Desktop/Projects/model-benchmark/results/private/models/grok-4-7-high-cursor-standard/writing-explanation-v2/run-1792798072777-5weam';
export const approvedAdditionalTrials={
 'lp-local-llm-v2':'C:/Users/PUBLIC_USER/Desktop/Projects/model-benchmark/results/private/models/grok-4-7-high-cursor-standard/lp-local-llm-v2/run-20261024-lp-standard1',
 'research-repository-v2':'C:/Users/PUBLIC_USER/Desktop/Projects/model-benchmark/results/private/models/grok-4-7-high-cursor-standard/research-repository-v2/run-20261024-summary-standard1'
};
export function trustContinuationAllowed(work,previous,eventBytes,stderr){return path.resolve(work)===path.resolve(approvedTrustTrial)&&previous?.status==='failed'&&previous.attemptIndex===1&&previous.exitCode===1&&!previous.sessionId&&!previous.usage&&eventBytes===0&&stderr.includes('Workspace Trust Required');}
export function finalText(events){const a=events.findLast(e=>e.type==='assistant'),text=a?.message?.content?.filter(c=>c.type==='text').map(c=>c.text).join('');if(typeof text==='string'&&text.length)return text;const result=events.findLast(e=>e.type==='result');return typeof result?.result==='string'?result.result:'';}
export const modelMatches=m=>typeof m==='string'&&/grok\s*4[.-]7/i.test(m)&&/high/i.test(m)&&!/fast/i.test(m);
export function inspect(){const call=a=>spawnSync(cliNode,[cli,...a],{encoding:'utf8',windowsHide:true});const v=call(['--version']),auth=call(['status']),models=call(['--list-models']);const blockers=[];if(v.status!==0||v.stdout.trim()!==version)blockers.push('Pinned official CLI version mismatch');if(auth.status!==0||!auth.stdout.includes('Logged in'))blockers.push('Existing login not confirmed');if(models.status!==0||!models.stdout.split(/\r?\n/).some(l=>l.startsWith(modelId+' - ')))blockers.push('Exact non-Fast Grok High absent from account catalog');if(['CURSOR_API_KEY','CURSOR_AUTH_TOKEN','CURSOR_API_ENDPOINT'].some(k=>process.env[k]))blockers.push('API credential or endpoint override present');return {ready:!blockers.length,blockers,data:blockers.length?[]:[{id:modelId}],version,modelId,speed:'standard',effort:'high',costPolicy:'included pool only; zero additional spending, including prepaid credit',executionPolicy:'public CLI ask mode; trial deny rules; standard context; no OS filesystem sandbox claim'};}
async function main(){if(process.argv.includes('--prepare')||process.argv.includes('--models')){const info=inspect();console.log(JSON.stringify(info));if(!info.ready)process.exitCode=78;return;}
 const get=n=>{let i=process.argv.indexOf(n);return i<0?'':process.argv[i+1];},kind=get('--prompt-version');
 const additionalTrial=Object.entries(approvedAdditionalTrials).some(([task,dir])=>kind===task&&path.resolve(process.cwd())===path.resolve(dir));
 if(!kind.startsWith('writing-')&&!kind.startsWith('lp-')&&!(kind==='research-repository-v2'&&additionalTrial))throw Error('Task not approved for prompt-only adapter; 3D held');
 if(path.resolve(get('--output'))!==path.resolve('artifacts'))throw Error('Dedicated trial artifacts required');
 const previous=await optionalJson('adapter-state.json');let approvedTrust=false,approvedNormal=false;
 if(previous){if(previous.attemptIndex===2&&previous.failureCategory==='backend-workspace-context-exclusion-refused'&&path.resolve(process.cwd())===path.resolve(approvedTrustTrial)&&process.env.MODEL_BENCHMARK_RESUME==='continue'){
   const raw=await fs.readFile('cursor-attempt-2.stdout.jsonl','utf8'),err=await fs.readFile('cursor-attempt-2.stderr.log','utf8');const events=raw.split(/\r?\n/).filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});
   approvedNormal=err.includes('Workspace context exclusion is not allowed')&&!events.some(e=>e.type==='assistant'||e.type==='result');
  }else{const bytes=(await fs.stat('cursor-attempt-1.stdout.jsonl')).size,err=await fs.readFile('cursor-attempt-1.stderr.log','utf8');approvedTrust=process.env.MODEL_BENCHMARK_RESUME==='continue'&&trustContinuationAllowed(process.cwd(),previous,bytes,err);}if(!approvedTrust&&!approvedNormal)throw Error('No duplicate or unverified continuation permitted');}
 else if(process.env.MODEL_BENCHMARK_RESUME==='continue'&&!additionalTrial)throw Error('No pre-inference trust stop to continue');
 const info=inspect();if(!info.ready)throw Error(info.blockers.join('; '));
 let prompt='';for await(const b of process.stdin)prompt+=b;
 if(kind==='research-repository-v2'){
  const allowedInput='C:/Users/PUBLIC_USER/Desktop/Projects/model-benchmark/runtime/private/inputs-v2/yamichi-grok-reviewed-summary-v2';if(path.resolve(get('--input'))!==path.resolve(allowedInput))throw Error('Unapproved research input');
  const manifest=JSON.parse(await fs.readFile(path.join(allowedInput,'send-allowlist.json'),'utf8'));if(!manifest.readyForTransmission||manifest.allowlist.some(p=>/(^|\/)\.env/.test(p)))throw Error('Input allowlist not ready');
  prompt+='\n\n'+await fs.readFile(path.join(allowedInput,'send-corpus.txt'),'utf8');await writeJson('input-allowlist.json',manifest);
 }
 // No repository or external file is attached. Fixed prompt already embeds its facts.
 if(approvedTrust||approvedNormal){if(await fs.readFile('effective-prompt.txt','utf8')!==prompt)throw Error('Fixed prompt changed');if(await fs.readFile('.cursor/cli.json','utf8')!==JSON.stringify(permissionConfig(),null,2))throw Error('Trial permissions changed');await writeJson(approvedTrust?'adapter-state-before-trust.json':'adapter-state-before-standard-context.json',previous);}
 else{await fs.mkdir('.cursor',{recursive:true});await fs.writeFile('.cursor/cli.json',JSON.stringify(permissionConfig(),null,2),{flag:'wx'});await fs.writeFile('effective-prompt.txt',prompt,{flag:'wx'});}
 const attempt=approvedNormal?3:approvedTrust?2:1,args=argumentsFor(process.cwd());if(approvedTrust||additionalTrial)args.push('--trust');
 const state={status:'running',modelId,speed:'standard',effort:'high',attemptIndex:attempt,resumeAvailable:false,startedAt:new Date().toISOString(),executionPolicy:'public CLI ask mode; trial deny rules; standard context; no OS filesystem sandbox claim',...approvedTrust?{workspaceTrustApproval:'Explicit user approval Sentinel_105aea8c92c08191945043e32838e9fd; exact writing trial only',continuationMode:'initial-inference-after-workspace-trust'}:{},...approvedNormal?{continuationMode:'initial-generation-after-rejected-internal-option',standardContextApproval:'Sentinel_f23969fcaf6c8191832f1258cf87ab59; public normal CLI; previous usage unknown retained'}:{},...additionalTrial?{workspaceTrustApproval:'Explicit user approval Sentinel_ce145bfa92188191b046830e989e7f96; exact LP and summary trial folders only',continuationMode:'initial'}:{}};
 await writeJson('adapter-state.json',state);await writeJson('cursor-invocation-'+attempt+'.json',{command:cliNode,args,costPolicy:info.costPolicy});
 const r=await streamCommand(cliNode,args,{stdin:prompt,prefix:'cursor-attempt-'+attempt,onEvent:e=>{if(e.session_id)state.sessionId=e.session_id;}});
 const limit=rateLimitInfo(r.events,r.stderr),result=r.events.findLast(e=>e.type==='result'),text=finalText(r.events);
 const spending=/(?:additional usage|top.?up|purchase credits|upgrade your plan|insufficient credits)/i.test(r.stderr+'\n'+JSON.stringify(r.events.filter(e=>e.type==='error'||e.is_error)));
 const init=r.events.find(e=>e.type==='system'&&e.subtype==='init'),effectiveModel=init?.model||result?.model||null;
 const wrongModel=effectiveModel&&!modelMatches(effectiveModel);
 Object.assign(state,{status:limit?'rate-limited':spending?'billing-blocked':wrongModel?'model-mismatch':r.code===0&&!result?.is_error&&text?'success':'failed',sessionId:state.sessionId||null,effectiveModel,resumeAvailable:false,exitCode:r.code,finishedAt:new Date().toISOString(),usage:result?.usage||null,...limit});await writeJson('adapter-state.json',state);
 if(state.status==='success')process.stdout.write(text);else{console.error('Cursor trial stopped: '+state.status+'; logs retained; no regeneration');process.exitCode=limit?75:spending?78:r.code||1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
