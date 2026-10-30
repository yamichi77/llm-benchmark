import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import geminiDiagnostics from './gemini-diagnostics.cjs';
import {httpTransportPolicy,httpPolicyFile} from './gemini-http-bootstrap.mjs';
import {optionalJson,writeJson,streamCommand,rateLimitInfo} from './session-support.mjs';
import {geminiModel,geminiVersion,geminiThinking,imageNames,taskKind,trialSettings,policyText,buildArguments,effectivePrompt,parseStream,paymentLimitInfo} from './gemini-policy.mjs';
const runtime=path.dirname(fileURLToPath(import.meta.url));
export const prepaidPolicy=Object.freeze({mode:'existing-provider-prepay',ownerReportedBalanceJpy:900,ownerReportedAutoRecharge:false,billingSettingsVerified:false,clientMonetaryCap:false,additionalChargeAuthorized:false,onProviderLimit:'stop-no-retry'});

const bundle=path.join(path.dirname(process.execPath),'node_modules/@google/gemini-cli/bundle');
const cli=path.join(bundle,'gemini.js');
// Explicit child arguments/env only: no NODE_OPTIONS or global CLI modification.
export function geminiChildLaunch(args,env=process.env){return {args:['--import',pathToFileURL(path.join(runtime,'gemini-http-bootstrap.mjs')).href,cli,...args],env:{...env,MODEL_BENCHMARK_GEMINI_DIAGNOSTICS:'1',MODEL_BENCHMARK_GEMINI_HEADERS_TIMEOUT:'300000'}};}
// These are installed 0.65.0 exports, not downloaded or patched CLI code.
export async function installedModules(){return {core:await import(pathToFileURL(path.join(bundle,'chunk-W5GQW7T7.js'))),settings:await import(pathToFileURL(path.join(bundle,'chunk-AZOL6UFL.js')))};}
export async function inspectGemini(){
 const pkg=await optionalJson(path.join(bundle,'../package.json'));const blockers=[];
 if(pkg?.version!==geminiVersion)blockers.push('CLI version changed; recheck installed policy/image/settings API before execution');
 const v=spawnSync(process.execPath,[cli,'--version'],{encoding:'utf8',windowsHide:true});if(v.status!==0||v.stdout.trim()!==geminiVersion)blockers.push('CLI startup/version check failed');
 const user=await optionalJson(path.join(os.homedir(),'.gemini/settings.json'));const auth=user?.security?.auth?.selectedType;
 if(auth!=='gemini-api-key')blockers.push('Existing API-key authentication selection not confirmed');
 if(['GOOGLE_GENAI_USE_VERTEXAI','GOOGLE_GENAI_USE_GCA','GOOGLE_GEMINI_BASE_URL','GEMINI_CLI_SYSTEM_SETTINGS_PATH'].some(n=>process.env[n]))blockers.push('Provider/system setting override present; route requires review');
 let storedApiKeyPresent=null,trialTrust=null;if(pkg?.version===geminiVersion){const {core}=await installedModules();storedApiKeyPresent=Boolean(await core.loadApiKey());trialTrust=core.checkPathTrust({path:path.resolve(runtime,'../results/private/models/gemini-4-argon-cli'),isFolderTrustEnabled:true,isHeadless:true}).isTrusted===true;}
 const envApiKeyPresent=Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY);if(!envApiKeyPresent&&!storedApiKeyPresent)blockers.push('No existing API key found (key content is never reported)');
 const localPreparationReady=!blockers.length;
 return {ready:localPreparationReady,localPreparationReady,billingPolicy:prepaidPolicy,blockers,cliPath:cli,version:v.stdout.trim(),modelId:geminiModel,thinking:geminiThinking,maxOutputTokens:65536,authMethod:auth||'unconfirmed',storedApiKeyPresent,environmentApiKeyPresent:envApiKeyPresent,trialAncestorTrusted:trialTrust,accountModelAvailability:'unverified; no model API request',cliArgonCompatibility:'officially not optimized; live behavior unverified',modelInferenceRequests:0};
}
export async function prepareTrial({work,kind,input,prompt,blenderPort=9877}){
 if(['research','model3d'].includes(kind)){
  if(!input)throw Error('Fixed input required');
  if(kind==='research')await fs.cp(await fs.realpath(input),path.join(work,'input'),{recursive:true,force:false,errorOnExist:true});
  else{await fs.mkdir(path.join(work,'input'));for(const name of imageNames){const data=await fs.readFile(path.join(input,name));if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid fixed PNG: '+name);await fs.writeFile(path.join(work,'input',name),data,{flag:'wx'});}}
 }
 await fs.mkdir(path.join(work,'.gemini'),{recursive:true});await fs.writeFile(path.join(work,'.gemini/settings.json'),JSON.stringify(trialSettings(kind,{runtime,work,blenderPort}),null,2),{flag:'wx'});
 const policy=path.join(work,'.gemini/benchmark.toml');await fs.writeFile(policy,policyText(kind),{flag:'wx'});const effective=effectivePrompt(prompt,kind);await fs.writeFile(path.join(work,'effective-prompt.txt'),effective,{flag:'wx'});
 return {args:buildArguments(kind,policy),prompt:effective};
}
async function verifyTrial(work,kind){const {core,settings}=await installedModules();const loaded=settings.loadSettings(work);if(!settings.isWorkspaceTrusted(loaded.merged,work).isTrusted)throw Error('Trial workspace is not already trusted; no trust/security setting is changed by this adapter');
 if(loaded.merged.general?.maxAttempts!==1||loaded.merged.general?.retryFetchErrors!==false)throw Error('Benchmark no-retry settings were not applied');
 if(loaded.merged.hooksConfig?.enabled!==false||loaded.merged.context?.fileName?.length!==0||loaded.merged.privacy?.usageStatisticsEnabled!==false||loaded.merged.telemetry?.enabled!==false)throw Error('Trial isolation settings were not applied');
 const model=new core.ModelConfigService(loaded.merged.modelConfigs).getResolvedConfig({model:geminiModel,isChatModel:true});if(model.model!==geminiModel||model.generateContentConfig?.thinkingConfig?.thinkingLevel!==geminiThinking||model.generateContentConfig?.maxOutputTokens!==65536)throw Error('Generation settings were not applied');
 const config=await core.createPolicyEngineConfig({...loaded.merged,policyPaths:[path.join(work,'.gemini/benchmark.toml')]},core.ApprovalMode.DEFAULT,undefined,false);if(config.errors?.length)throw Error('Installed policy loader rejected benchmark policy');const engine=new core.PolicyEngine(config);const previousDebug=core.debugLogger.debug;try{core.debugLogger.debug=(...args)=>console.error(...args);for(const name of ['run_shell_command','write_file','replace','read_file','glob','grep_search','web_fetch','google_web_search']){if((await engine.check({name,args:{}})).decision!=='deny')throw Error('Effective policy did not deny '+name);}}finally{core.debugLogger.debug=previousDebug;}
}
async function main(){const info=await inspectGemini();if(process.argv.includes('--prepare')||process.argv.includes('--models')){console.log(JSON.stringify({...info,...process.argv.includes('--models')?{data:info.ready?[{id:geminiModel,availability:'account-unverified'}]:[]}:{}}));if(!info.ready)process.exitCode=78;return;}
 if(!info.ready)throw Error(info.blockers.join('; '));const get=n=>{const i=process.argv.indexOf(n);return i<0?'':process.argv[i+1];};const kind=taskKind(get('--prompt-version'));
 if(path.resolve(get('--output'))!==path.resolve('artifacts'))throw Error('Requires dedicated trial artifacts');if(await optionalJson('adapter-state.json'))throw Error('Existing Gemini trial cannot be overwritten; no automatic repeat/resume is configured');if(process.env.MODEL_BENCHMARK_RESUME==='continue')throw Error('Gemini same-session continuation is not yet verified; no new request sent');
 const blenderPort=kind==='model3d'?Number(get('--benchmark-blender-port')||9877):9877;if(![9877,9878].includes(blenderPort))throw Error('Unsupported benchmark Blender port');let prompt='';for await(const b of process.stdin)prompt+=b;const invocation=await prepareTrial({work:process.cwd(),kind,input:get('--input'),prompt,blenderPort});await verifyTrial(process.cwd(),kind);
 const state={status:'running',modelId:geminiModel,thinking:geminiThinking,maxOutputTokens:65536,sessionId:null,resumeAvailable:false,attemptIndex:1,continuationMode:'initial',executionPolicy:'gemini-default-deny-v1',blenderPort:kind==='model3d'?blenderPort:null,billingPolicy:prepaidPolicy,httpTransportPolicy:{...httpTransportPolicy,applied:false},startedAt:new Date().toISOString()};await writeJson('adapter-state.json',state);await writeJson('gemini-invocation.json',{...state,command:process.execPath,args:invocation.args});
 const launch=geminiChildLaunch(invocation.args);const result=await streamCommand(process.execPath,launch.args,{env:launch.env,stdin:invocation.prompt,prefix:'gemini-attempt-1'});
 // Decode complete raw bytes after exit, so split UTF-8 chunks cannot change saved output.
 const events=(await fs.readFile('gemini-attempt-1.stdout.jsonl','utf8')).split(/\r?\n/).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});const parsed=parseStream(events,result.code),limit=rateLimitInfo(events,result.stderr),payment=paymentLimitInfo(events,result.stderr);
 let transportLog='',diagnosticsReadFailed=false;try{transportLog=await fs.readFile(geminiDiagnostics.logName,'utf8');}catch{diagnosticsReadFailed=true;}
 const toolExecutionSummary=geminiDiagnostics.summarizeToolResults(events),transportDiagnostics={...geminiDiagnostics.summarizeTransportLog(transportLog),...(diagnosticsReadFailed?{readFailed:true}:{})};
 const applied=await optionalJson(httpPolicyFile);state.httpTransportPolicy={...httpTransportPolicy,applied:applied?.applied===true&&applied?.headersTimeoutMs===300000&&applied?.bodyTimeoutMs===300000&&applied?.laterConfigGetterPinned===true};
 if(parsed.status==='success'&&!state.httpTransportPolicy.applied)parsed.status='transport-policy-not-applied';
 Object.assign(state,{toolExecutionSummary,transportDiagnostics,status:payment?'billing-exhausted':limit?'rate-limited':parsed.status,sessionId:parsed.sessionId||events.find(e=>e.type==='init')?.session_id||null,finishedAt:new Date().toISOString(),exitCode:result.code,observedModels:parsed.models,usage:parsed.stats||null,...limit,...payment});await writeJson('adapter-state.json',state);
 if(state.status==='success')process.stdout.write(parsed.text);else{console.error('Gemini trial '+state.status+'; raw output preserved, no regeneration');process.exitCode=payment?76:limit?75:state.status==='permission-required'?77:result.code||1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=78;});
