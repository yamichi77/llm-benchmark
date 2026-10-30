import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {httpTransportPolicy,httpPolicyFile,installHeaderTimeout,isCliWorker} from '../runtime/gemini-http-bootstrap.mjs';
import {geminiChildLaunch} from '../runtime/gemini-cli-run.mjs';
import {trialSettings} from '../runtime/gemini-policy.mjs';
import {run} from '../runtime/runner.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'runtime');
const bundle=path.join(path.dirname(process.execPath),'node_modules/@google/gemini-cli/bundle');
const core=await import(pathToFileURL(path.join(bundle,'chunk-DKZARV6U.js')));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'model-benchmark-gemini-http-'));
function dispatcherTimeouts(){const dispatcher=globalThis[Symbol.for('undici.globalDispatcher.1')],key=Object.getOwnPropertySymbols(dispatcher).find(key=>key.description==='options'),options=dispatcher[key];return {headersTimeout:options.headersTimeout,bodyTimeout:options.bodyTimeout};}

test('scoped Node import is preserved by the installed relaunch without changing parent environment',async()=>{
 const before={headers:process.env.MODEL_BENCHMARK_GEMINI_HEADERS_TIMEOUT,nodeOptions:process.env.NODE_OPTIONS},launch=geminiChildLaunch(['--version'],{});
 assert.equal(launch.args[0],'--import');assert.equal(launch.args[2],path.join(bundle,'gemini.js'));assert.equal(launch.env.MODEL_BENCHMARK_GEMINI_HEADERS_TIMEOUT,'300000');assert.equal(launch.env.NODE_OPTIONS,undefined);assert.equal(process.env.MODEL_BENCHMARK_GEMINI_HEADERS_TIMEOUT,before.headers);assert.equal(process.env.NODE_OPTIONS,before.nodeOptions);
 assert.equal(isCliWorker({}),false);assert.equal(isCliWorker({GEMINI_CLI_NO_RELAUNCH:'true'}),true);assert.equal(isCliWorker({SANDBOX:'sandbox'}),true);
 const relaunch=await import(pathToFileURL(path.join(bundle,'chunk-GFC74TMK.js'))),result=relaunch.getSpawnConfig([],['--version']);assert.deepEqual(result.spawnArgs.slice(0,process.execArgv.length),process.execArgv);assert.equal(result.env.GEMINI_CLI_NO_RELAUNCH,'true');
});

test('actual dispatcher and later initialization stay at 300000/300000; rollback restores the original getter and 60000',()=>{
 assert.deepEqual(dispatcherTimeouts(),{headersTimeout:60000,bodyTimeout:300000});const original=core.Config.prototype.getRequestTimeoutMs,restore=installHeaderTimeout(core);
 try{assert.deepEqual(dispatcherTimeouts(),{headersTimeout:300000,bodyTimeout:300000});const config=Object.create(core.Config.prototype);config.experiments={flags:{45773134:{intValue:'60'}}};const selected=config.getRequestTimeoutMs();assert.equal(selected,300000);if(selected!==undefined)core.updateGlobalFetchTimeouts(selected);assert.deepEqual(dispatcherTimeouts(),{headersTimeout:300000,bodyTimeout:300000});}finally{restore();}
 assert.equal(core.Config.prototype.getRequestTimeoutMs,original);assert.deepEqual(dispatcherTimeouts(),{headersTimeout:60000,bodyTimeout:300000});
});

test('MCP/SDK/shell deadlines are untouched; each failed model request has exactly one attempt',async()=>{
 const settings=trialSettings('model3d',{runtime,work:temp});assert.equal(settings.general.maxAttempts,1);assert.equal(settings.general.retryFetchErrors,false);assert.equal(settings.mcpServers.blender_benchmark.timeout,undefined);assert.equal(settings.modelConfigs.customOverrides[0].modelConfig.generateContentConfig.httpOptions,undefined);assert.equal(settings.tools,undefined);
 for(const error of [Object.assign(new Error('offline 402'),{status:402}),Object.assign(new Error('offline 429'),{status:429}),new Error('exception TypeError: fetch failed sending request')]){let calls=0;await assert.rejects(core.retryWithBackoff(async()=>{calls++;throw error;},{maxAttempts:settings.general.maxAttempts,retryFetchErrors:settings.general.retryFetchErrors,initialDelayMs:1,maxDelayMs:1}));assert.equal(calls,1);}
});

test('real CLI version startup/relaunch keeps final dispatcher and captures pre-SDK cause without any network',async()=>{
 const dir=await fs.mkdtemp(path.join(temp,'startup-')),home=path.join(dir,'home');await fs.mkdir(home);await fs.writeFile(path.join(home,'settings.json'),JSON.stringify({advanced:{autoConfigureMemory:false},general:{enableAutoUpdate:false,enableAutoUpdateNotification:false}}));
 const setup=path.join(dir,'fake-fetch.cjs'),probe=path.join(dir,'offline-probe.mjs');await fs.writeFile(setup,"globalThis.__fixtureCalls=0;globalThis.__fixtureModelCalls=0;globalThis.fetch=async input=>{globalThis.__fixtureCalls++;if(new URL(input).hostname==='generativelanguage.googleapis.com')globalThis.__fixtureModelCalls++;throw new TypeError('SECRET URL',{cause:Object.assign(new Error('SECRET'),{code:'UND_ERR_HEADERS_TIMEOUT'})})};");
 await fs.writeFile(probe,`
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
if(!process.env.GEMINI_CLI_NO_RELAUNCH&&!process.env.SANDBOX){fs.writeFileSync('outer-process-seen','offline');}else{
 const core=await import(pathToFileURL(${JSON.stringify(path.join(bundle,'chunk-DKZARV6U.js'))}));
 const source=fs.readFileSync(${JSON.stringify(path.join(bundle,'chunk-DKZARV6U.js'))},'utf8'),start=source.indexOf('  async apiCall(url3, requestInit) {'),end=source.indexOf('  getDefaultHeaders() {',start);if(start<0||end<start)throw Error('SDK source changed');
 const sdk=new Function('fetch','return ({'+source.slice(start,end)+'}).apiCall;')(globalThis.fetch);let wrapped;try{await sdk('https://generativelanguage.googleapis.com/?key=SECRET',{body:'SECRET',headers:{Authorization:'SECRET'}});}catch(error){wrapped=error;}
 if(wrapped?.message!=='exception TypeError: SECRET URL sending request'||wrapped.cause!==undefined)throw Error('Expected SDK conversion absent');
 const config=Object.create(core.Config.prototype);config.experiments={flags:{45773134:{intValue:'60'}}};const selected=config.getRequestTimeoutMs();if(selected!==undefined)core.updateGlobalFetchTimeouts(selected);
 process.once('exit',()=>{const dispatcher=globalThis[Symbol.for('undici.globalDispatcher.1')],key=Object.getOwnPropertySymbols(dispatcher).find(key=>key.description==='options'),options=dispatcher[key];fs.writeFileSync('offline-startup-proof.json',JSON.stringify({worker:!!process.env.GEMINI_CLI_NO_RELAUNCH,modelCalls:globalThis.__fixtureModelCalls,selected,headersTimeout:options.headersTimeout,bodyTimeout:options.bodyTimeout,sdkCauseLost:wrapped.cause===undefined}));});
}
`);
 const launch=geminiChildLaunch(['--version']),env={...launch.env,GEMINI_CLI_HOME:home};delete env.GEMINI_CLI_NO_RELAUNCH;delete env.SANDBOX;
 const child=spawnSync(process.execPath,['--require',setup,...launch.args.slice(0,2),'--import',pathToFileURL(probe).href,...launch.args.slice(2)],{cwd:dir,env,encoding:'utf8',windowsHide:true,timeout:45000});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/0\.65\.0/);await fs.access(path.join(dir,'outer-process-seen'));
 const proof=JSON.parse(await fs.readFile(path.join(dir,'offline-startup-proof.json'),'utf8'));assert.deepEqual(proof,{worker:true,modelCalls:1,selected:300000,headersTimeout:300000,bodyTimeout:300000,sdkCauseLost:true});
 const policy=JSON.parse(await fs.readFile(path.join(dir,httpPolicyFile),'utf8'));assert.equal(policy.applied,true);assert.equal(policy.laterConfigGetterPinned,true);assert.equal(policy.phase,'cli-worker-startup');
 const diagnostics=await fs.readFile(path.join(dir,'gemini-transport-errors.jsonl'),'utf8');assert.ok(!diagnostics.includes('SECRET'));const records=diagnostics.trim().split('\n').map(JSON.parse),modelErrors=records.filter(row=>row.event==='fetch-error'&&row.scope==='gemini-api');assert.equal(records.filter(row=>row.event==='capture-ready').length,1);assert.equal(modelErrors.length,1);assert.equal(modelErrors[0].error.cause.code,'UND_ERR_HEADERS_TIMEOUT');assert.equal(modelErrors[0].category,'timeout');
});

test('runner publishes changed benchmark conditions without unrelated private fields',async()=>{
 const dir=await fs.mkdtemp(path.join(temp,'result-')),out=path.join(dir,'results'),relative='models/fixture/header-fixture/run-offline',work=path.join(out,'private',relative);await fs.mkdir(work,{recursive:true});await fs.writeFile(path.join(dir,'prompt.txt'),'offline');await fs.writeFile(path.join(work,'prompt.txt'),'offline');const policy={...httpTransportPolicy,applied:true};await fs.writeFile(path.join(work,'adapter-state.json'),JSON.stringify({status:'failed',httpTransportPolicy:policy,unrelatedSecret:'SECRET'}));
 const config=path.join(dir,'config.json');await fs.writeFile(config,JSON.stringify({models:[{id:'fixture',command:process.execPath,args:[path.join(root,'development/fixture-io.mjs'),'file','{promptFile}'],promptMode:'file'}],tasks:[{id:'header-fixture',type:'writing',prompt:'prompt.txt',skipReason:'offline-only'}]}));await run(config,out,{viewer:false,publish:false,resumeTrial:{id:'offline',task:'header-fixture',model:'fixture',trialPath:relative}});const raw=await fs.readFile(path.join(out,'public',relative,'result.json'),'utf8'),result=JSON.parse(raw);assert.equal(result.status,'skipped');assert.deepEqual(result.httpTransportPolicy,policy);assert.ok(!raw.includes('SECRET'));
});
