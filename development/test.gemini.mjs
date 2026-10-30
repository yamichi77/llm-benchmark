import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {geminiModel,geminiThinking,imageNames,allowedTools,policyText,trialSettings,buildArguments,effectivePrompt,parseStream} from '../runtime/gemini-policy.mjs';
import {installedModules,prepareTrial} from '../runtime/gemini-cli-run.mjs';
import {streamCommand,rateLimitInfo} from '../runtime/session-support.mjs';
import {run} from '../runtime/runner.mjs';
import {compare} from '../runtime/comparison.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'runtime');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'model-benchmark-gemini-offline-'));
const {core}=await installedModules();
core.debugLogger.debug=()=>{};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz8AAAAASUVORK5CYII=','base64');

test('fixed four tasks and versions are unchanged; Gemini has its own model storage',async()=>{
 const read=async n=>JSON.parse(await fs.readFile(path.join(runtime,'benchmarks/v2',n),'utf8'));const original=await read('config-astra.json'),gemini=await read('config-gemini.json');assert.deepEqual(gemini.tasks,original.tasks);assert.equal(gemini.models[0].modelId,geminiModel);assert.equal(gemini.models[0].id,'gemini-4-argon-cli');assert.match(gemini.models[0].preflight.args.join(' '),/--models/);for(const task of gemini.tasks){await fs.access(path.resolve(runtime,'benchmarks/v2',task.prompt));await fs.access(path.resolve(runtime,'benchmarks/v2',task.input));}
});
test('installed CLI TOML parser/engine enforces exact MCP tool/server allowlist and hides other tools',async()=>{
 for(const kind of ['writing','research','model3d','lp']){
  const file=path.join(temp,kind+'.toml');await fs.writeFile(file,policyText(kind));const parsed=await core.loadPoliciesFromToml([file],()=>4);assert.deepEqual(parsed.errors,[]);const engine=new core.PolicyEngine({...parsed,nonInteractive:true,approvalMode:core.ApprovalMode.DEFAULT});
  for(const name of ['run_shell_command','write_file','read_file','web_fetch','google_web_search','ask_user'])assert.equal((await engine.check({name,args:{}})).decision,'deny',kind+' '+name);
  const permitted=allowedTools(kind);for(const r of permitted){const name=core.formatMcpToolName(r.mcpName,r.toolName);assert.equal((await engine.check({name,args:{}},r.mcpName)).decision,'allow',name);assert.equal((await engine.check({name:core.formatMcpToolName('other',r.toolName),args:{}},'other')).decision,'deny');assert.equal(engine.getExcludedTools(new Map([[name,{_serverName:r.mcpName}]]),[name]).has(name),false);}
  assert.equal((await engine.check({name:core.formatMcpToolName('blender_benchmark','execute_shell_command'),args:{}},'blender_benchmark')).decision,'deny');assert.equal(engine.getExcludedTools(undefined,['run_shell_command']).has('run_shell_command'),true);
 }
 const engine=new core.PolicyEngine({rules:[{toolName:'needs_permission',decision:'ask_user',priority:1}],nonInteractive:true});assert.equal((await engine.check({name:'needs_permission',args:{}})).decision,'deny');
});
test('installed model resolver pins medium/65536 for primary and helper aliases; no fallback CLI flags',()=>{
 const settings=trialSettings('model3d',{runtime,work:temp});const service=new core.Config({model:geminiModel,targetDir:temp,cwd:temp,sessionId:'offline-generation-fixture',interactive:false,modelConfigServiceConfig:settings.modelConfigs}).modelConfigService;
 for(const model of [geminiModel,'chat-base','summarizer-default']){const r=service.getResolvedConfig({model,isChatModel:true});assert.equal(r.model,geminiModel);assert.equal(r.generateContentConfig.thinkingConfig.thinkingLevel,geminiThinking);assert.equal(r.generateContentConfig.maxOutputTokens,65536);}
 const args=buildArguments('model3d','fixture.toml');assert.equal(args[args.indexOf('--model')+1],geminiModel);assert.equal(args[args.indexOf('--approval-mode')+1],'default');assert.equal(args[args.indexOf('--extensions')+1],'none');assert.equal(args.some(a=>/yolo|skip-trust|admin-policy/.test(a)),false);assert.equal(settings.hooksConfig.enabled,false);assert.equal(settings.privacy.usageStatisticsEnabled,false);assert.deepEqual(settings.context.fileName,[]);
});
test('trial preparation copies exactly four PNGs (no answer GLB); installed @ parser embeds all image bytes offline',async()=>{
 const work=path.join(temp,'image-trial'),input=path.join(temp,'image-source');await fs.mkdir(work);await fs.mkdir(input);for(const n of imageNames)await fs.writeFile(path.join(input,n),png);await fs.writeFile(path.join(input,'answer.glb'),'must not be copied');const invocation=await prepareTrial({work,kind:'model3d',input,prompt:'固定の日本語指示'});assert.deepEqual((await fs.readdir(path.join(work,'input'))).sort(),[...imageNames].sort());assert.ok(invocation.prompt.startsWith('固定の日本語指示'));for(const n of imageNames)assert.ok(invocation.prompt.includes('@input/'+n));
 const base=path.join(path.dirname(process.execPath),'node_modules/@google/gemini-cli/bundle');const ui=await import(pathToFileURL(path.join(base,'chunk-34OW3ELT.js')));const config=new core.Config({targetDir:work,cwd:work,model:geminiModel,sessionId:'offline-fixture',interactive:false});const registry=new core.ResourceRegistry();config.getResourceRegistry=()=>registry;config.getToolRegistry=()=>({getTool:()=>undefined});const parsed=await ui.handleAtCommand({query:invocation.prompt,config,addItem:()=>{},onDebugMessage:()=>{},messageId:1,signal:new AbortController().signal});const images=parsed.processedQuery.filter(p=>p.inlineData);assert.equal(images.length,4);for(const p of images){assert.equal(p.inlineData.mimeType,'image/png');assert.equal(p.inlineData.data,png.toString('base64'));}
});
test('fake stream preserves UTF-8 final output, distinguishes permissions/rate limits/model mismatch without inference',async()=>{
 const code=`process.stdout.write(JSON.stringify({type:'init',model:'${geminiModel}',session_id:'fake'})+'\\n');process.stdout.write(JSON.stringify({type:'message',role:'assistant',content:'途中説明'})+'\\n');process.stdout.write(JSON.stringify({type:'tool_use'})+'\\n');const b=Buffer.from(JSON.stringify({type:'message',role:'assistant',content:'<!doctype html>日本語の未改変LP'})+'\\n');for(const c of b)process.stdout.write(Buffer.from([c]));process.stdout.write(JSON.stringify({type:'result',status:'success',stats:{models:{'${geminiModel}':{tokens:{total:12}}}}})+'\\n');`;
 const prefix=path.join(temp,'fake-stream');const r=await streamCommand(process.execPath,['-e',code],{prefix});const events=(await fs.readFile(prefix+'.stdout.jsonl','utf8')).trim().split('\n').map(JSON.parse),parsed=parseStream(events,r.code);assert.equal(parsed.status,'success');assert.equal(parsed.text,'<!doctype html>日本語の未改変LP');assert.equal(parsed.sessionId,'fake');assert.equal(parseStream([...events,{type:'message',model:'another-model'}],0).status,'model-mismatch');assert.equal(parseStream([{type:'tool_result',status:'error',error:{message:'denied by policy'}}],1).status,'permission-required');assert.equal(parseStream(events,1).status,'failed');const rate=rateLimitInfo([{type:'result',error:{code:429,message:'Too many requests',retry_after_seconds:60}}]);assert.ok(rate?.retryAt);
});
test('existing runner saves a dummy Gemini LP and manifest without changing production results',async()=>{
 const dir=path.join(temp,'viewer-fixture');await fs.mkdir(dir);const html='<!doctype html>\n<title>Gemini準備用ダミー</title><p>未改変</p>';await fs.writeFile(path.join(dir,'prompt.txt'),html);const config={models:[{id:'gemini-offline-fixture',command:process.execPath,args:[path.join(root,'development/fixture-io.mjs'),'file','{promptFile}'],promptMode:'file'}],tasks:[{id:'lp-offline',type:'lp',prompt:'prompt.txt',promptVersion:'fixture-only',artifactSource:'stdout'}]};await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(config));const out=path.join(dir,'results');const m=await run(path.join(dir,'config.json'),out);assert.equal(m.results[0].status,'success');assert.equal(await fs.readFile(path.join(out,'public',m.results[0].artifact),'utf8'),html+'\n');assert.equal((await fs.stat(path.join(out,'public/index.html'))).isFile(),true);assert.equal((await fs.stat(path.join(out,'private',m.results[0].trialPath,'stdout.log'))).isFile(),true);assert.equal(await fs.access(path.join(out,'public/stdout.log')).then(()=>true,()=>false),false);
});
test('existing comparison coordinator holds later tasks after a Gemini rate limit and does not resend unknown-reset work',async()=>{
 const dir=path.join(temp,'pause-fixture');await fs.mkdir(dir);const out=path.join(dir,'results'),file=path.join(dir,'config.json');const config={models:[{id:'gemini-offline-fixture'}],tasks:['first','later'].map(id=>({id,type:'writing',promptVersion:'fixture-v1',inputVersion:'fixture-input'}))};await fs.writeFile(file,JSON.stringify(config));let calls=0;
 const onRun=async(_config,_out,{taskIds})=>{calls++;const pub=path.join(out,'public/models/gemini-offline-fixture',taskIds[0],'run-fake');await fs.mkdir(pub,{recursive:true});await fs.writeFile(path.join(pub,'result.json'),JSON.stringify({id:'fake',model:'gemini-offline-fixture',task:taskIds[0],type:'writing',promptVersion:'fixture-v1',inputVersion:'fixture-input',status:'rate-limited',excludedFromComparison:true,retryAt:null,resumeAvailable:false,createdAt:new Date().toISOString()}));};
 await compare({out,configFiles:[file],onRun,wait:true});assert.equal(calls,1);await compare({out,configFiles:[file],onRun,resume:true,wait:true});assert.equal(calls,1);assert.equal(await fs.access(path.join(out,'private/comparison.lock')).then(()=>true,()=>false),false);
});

test('prepay policy records owner report without claiming billing verification; 402 and 429 have no retry',async()=>{
 const {prepaidPolicy}=await import('../runtime/gemini-cli-run.mjs');const {paymentLimitInfo}=await import('../runtime/gemini-policy.mjs');assert.equal(prepaidPolicy.ownerReportedBalanceJpy,900);assert.equal(prepaidPolicy.ownerReportedAutoRecharge,false);assert.equal(prepaidPolicy.billingSettingsVerified,false);assert.equal(prepaidPolicy.clientMonetaryCap,false);assert.equal(prepaidPolicy.additionalChargeAuthorized,false);assert.equal(paymentLimitInfo([{type:'result',error:{code:402,message:'Payment Required'}}]).reason,'provider-payment-required');assert.equal(paymentLimitInfo([{type:'result',error:{code:429,message:'Too many requests'}}]),null);
 for(const status of [402,429]){let calls=0;const error=new Error('offline error');error.status=status;await assert.rejects(core.retryWithBackoff(async()=>{calls++;throw error;},{maxAttempts:1,retryFetchErrors:false,initialDelayMs:1,maxDelayMs:1}));assert.equal(calls,1);}
});
test('comparison holds later tasks on prepaid balance exhaustion and preserves its separate status',async()=>{
 const dir=path.join(temp,'payment-fixture');await fs.mkdir(dir);const out=path.join(dir,'results'),file=path.join(dir,'config.json');const config={models:[{id:'gemini-offline-fixture'}],tasks:['first','later'].map(id=>({id,type:'writing',promptVersion:'fixture-v1',inputVersion:'fixture-input'}))};await fs.writeFile(file,JSON.stringify(config));let calls=0;const onRun=async(_c,_o,{taskIds})=>{calls++;const pub=path.join(out,'public/models/gemini-offline-fixture',taskIds[0],'run-fake');await fs.mkdir(pub,{recursive:true});await fs.writeFile(path.join(pub,'result.json'),JSON.stringify({id:'payment-fake',model:'gemini-offline-fixture',task:taskIds[0],type:'writing',promptVersion:'fixture-v1',inputVersion:'fixture-input',status:'billing-exhausted',excludedFromComparison:true,pauseReason:'provider-payment-required',resumeAvailable:false,createdAt:new Date().toISOString()}));};const data=await compare({out,configFiles:[file],onRun,wait:true});assert.equal(calls,1);assert.equal(data.excluded[0].status,'billing-exhausted');assert.equal(await fs.access(path.join(out,'private/comparison.lock')).then(()=>true,()=>false),false);
});

test('native tool registry reproduces read_file alias exclusion and accepts the Gemini-specific read alias',()=>{
 const registry=new core.ToolRegistry({getApprovalMode:()=>core.ApprovalMode.DEFAULT},null);const make=n=>new core.DiscoveredMCPTool({},'benchmark_inputs',n,'fixed snapshot read',{type:'object',properties:{}},null,false,true,undefined,undefined);assert.equal(registry.isActiveTool(make('read_file'),new Set(['read_file'])),false);assert.equal(registry.isActiveTool(make('read_snapshot_file'),new Set(['read_file'])),true);
});
test('input MCP retains default name for other CLIs and Gemini alias has the same bounded read scope',async()=>{
 const {spawnSync}=await import('node:child_process');const input=path.join(temp,'alias-input');await fs.mkdir(input);await fs.writeFile(path.join(input,'README.md'),'offline fixture');for(const name of ['read_file','read_snapshot_file']){const requests=[{jsonrpc:'2.0',id:1,method:'tools/list'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:{path:'README.md'}}},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name,arguments:{path:'../not-allowed.txt'}}}];const r=spawnSync(process.execPath,[path.join(runtime,'input-mcp.mjs')],{cwd:temp,encoding:'utf8',windowsHide:true,input:requests.map(x=>JSON.stringify(x)).join('\n')+'\n',env:{...process.env,MODEL_BENCHMARK_INPUT:input,MODEL_BENCHMARK_READ_TOOL:name}});assert.equal(r.status,0);const events=r.stdout.trim().split('\n').map(JSON.parse);assert.deepEqual(events[0].result.tools.map(t=>t.name),['list_files',name]);assert.equal(events[1].result.content[0].text,'1: offline fixture');assert.equal(events[2].result.isError,true);}
});

test('retry 3D uses an independent approved loopback port; previous CLI defaults remain unchanged',async()=>{
 const normal=trialSettings('model3d',{runtime,work:temp}),retry=trialSettings('model3d',{runtime,work:temp,blenderPort:9878});assert.equal(normal.mcpServers.blender_benchmark.env.MODEL_BENCHMARK_BLENDER_PORT,'9877');assert.equal(retry.mcpServers.blender_benchmark.env.MODEL_BENCHMARK_BLENDER_PORT,'9878');assert.deepEqual(normal.mcpServers.blender_benchmark.includeTools,retry.mcpServers.blender_benchmark.includeTools);assert.throws(()=>trialSettings('model3d',{runtime,work:temp,blenderPort:9888}),/Unsupported/);const launch=await fs.readFile(path.join(runtime,'integrations/blender/launch.py'),'utf8'),host=await fs.readFile(path.join(runtime,'integrations/blender/host.py'),'utf8');assert.match(launch,/--factory-startup/);assert.match(launch,/--offline-mode/);assert.match(launch,/refusing to attach to another scene/);assert.match(host,/'--host','127.0.0.1'/);
});

// Communication diagnostics are tested with injected fetch functions only.
import geminiDiagnostics from '../runtime/gemini-diagnostics.cjs';
import {geminiChildLaunch} from '../runtime/gemini-cli-run.mjs';
const {safeError,observedFetch,summarizeToolResults,summarizeTransportLog}=geminiDiagnostics;

test('diagnostics preserve DNS/reset/timeout/abort causes and original errors without retry or network',async()=>{
 for(const [code,expected]of [['ENOTFOUND','dns'],['EAI_AGAIN','dns'],['ECONNRESET','connection-reset'],['UND_ERR_SOCKET','socket-closed'],['ECONNREFUSED','connection-refused'],['UND_ERR_CONNECT_TIMEOUT','timeout'],['ETIMEDOUT','timeout'],['ABORT_ERR','aborted'],['UNABLE_TO_VERIFY_LEAF_SIGNATURE','tls']]){
  const cause=Object.assign(new Error('SECRET cause body'),{code,hostname:'private-host',headers:{Authorization:'SECRET'}}),original=new TypeError('SECRET URL and token',{cause}),records=[];let calls=0;
  const fetch=observedFetch(async()=>{calls++;throw original;},r=>records.push(r));await assert.rejects(fetch('https://generativelanguage.googleapis.com/v1beta/models/test?key=SECRET',{body:'SECRET prompt'}),e=>e===original);
  assert.equal(calls,1);assert.equal(records.length,1);assert.equal(records[0].category,expected);assert.equal(records[0].error.cause.code,code);assert.equal(records[0].scope,'gemini-api');assert.ok(!JSON.stringify(records).includes('SECRET'));assert.ok(!JSON.stringify(records).includes('private-host'));
 }
 const records=[],original=new DOMException('SECRET','TimeoutError');await assert.rejects(observedFetch(async()=>{throw original;},r=>records.push(r))('https://other.invalid'),e=>e===original);assert.equal(records[0].category,'timeout');assert.equal(records[0].scope,'other');
});

test('HTTP diagnostics retain statuses without reading bodies/headers or replacing responses',async()=>{
 for(const [status,expected]of [[402,'http-payment-required'],[429,'http-rate-limit'],[503,'http-server'],[403,'http-client'],[200,null]]){
  const response={status,get headers(){throw Error('must not read headers');},async text(){throw Error('must not read response body');}},records=[];let calls=0;
  const fetch=observedFetch(async()=>{calls++;return response;},r=>records.push(r));assert.equal(await fetch('https://generativelanguage.googleapis.com/?key=SECRET'),response);assert.equal(calls,1);assert.equal(records.length,expected?1:0);if(expected){assert.equal(records[0].status,status);assert.equal(records[0].category,expected);}assert.ok(!JSON.stringify(records).includes('SECRET'));
 }
});

test('unknown, cyclic and aggregate exceptions are bounded and never serialize arbitrary secret fields',async()=>{
 const error={name:'SECRET custom type',message:'SECRET',stack:'SECRET',code:'SECRET',status:429,token:'SECRET',request:{Authorization:'SECRET'}};error.cause=error;
 const safe=safeError(error);assert.deepEqual(safe,{name:'UnknownError',status:429});assert.ok(!JSON.stringify(safe).includes('SECRET'));
 const nested=new AggregateError([Object.assign(new Error('SECRET'),{code:'ECONNRESET'})],'SECRET');assert.equal(safeError(nested).errors[0].code,'ECONNRESET');
 const records=[];const original=new TypeError('fetch failed SECRET');await assert.rejects(observedFetch(async()=>{throw original;},r=>records.push(r))('https://generativelanguage.googleapis.com'),e=>e===original);assert.equal(records[0].category,'unknown');assert.ok(!JSON.stringify(records).includes('SECRET'));
 await assert.rejects(observedFetch(async()=>{throw original;},()=>{throw Error('logger failed');})('https://generativelanguage.googleapis.com'),e=>e===original);
});

test('MCP payload errors are separate from successful transport and unrelated text does not count as failure',()=>{
 const events=[{type:'tool_use'},{type:'tool_use'},{type:'tool_use'},{type:'tool_use'},{type:'tool_use'},
  {type:'tool_result',status:'success',output:JSON.stringify({status:'error',message:'Traceback (most recent call last): SECRET'})},
  {type:'tool_result',status:'success',output:JSON.stringify({content:[{type:'text',text:JSON.stringify({status:'error',message:'not registered'})}]})},
  {type:'tool_result',status:'error',output:{isError:true}},
  {type:'tool_result',status:'success',output:JSON.stringify({status:'ok',result:{text:'Traceback (most recent call last) is a document example'}})},
  {type:'tool_result',status:'success',output:JSON.stringify({isError:true})}];
 assert.deepEqual(summarizeToolResults(events),{toolCalls:5,toolResults:5,transportSuccessfulToolResults:4,transportErrorResults:1,mcpPayloadErrors:4,failedToolResults:4,successfulToolResults:1,pythonTracebackResponses:1,unclassifiedToolResults:0});assert.ok(!JSON.stringify(summarizeToolResults(events)).includes('SECRET'));
});

test('project-local preload captures the original child fetch cause; no CLI, API or global environment change',async()=>{
 const {spawnSync}=await import('node:child_process');const dir=await fs.mkdtemp(path.join(temp,'transport-preload-'));const setup=path.join(dir,'fake-fetch.cjs'),main=path.join(dir,'fake-main.cjs');
 await fs.writeFile(setup,"globalThis.fetch=async()=>{throw new TypeError('SECRET',{cause:Object.assign(new Error('SECRET'),{code:'ENOTFOUND'})})};");
 await fs.writeFile(main,"fetch('https://generativelanguage.googleapis.com/?key=SECRET',{body:'SECRET prompt',headers:{Authorization:'Bearer SECRET'}}).catch(e=>{if(e.cause.code!=='ENOTFOUND')process.exitCode=1;else console.log('offline expected failure')});");
 const prior=process.env.MODEL_BENCHMARK_GEMINI_DIAGNOSTICS,launch=geminiChildLaunch([],{});assert.equal(launch.env.MODEL_BENCHMARK_GEMINI_DIAGNOSTICS,'1');assert.equal(process.env.MODEL_BENCHMARK_GEMINI_DIAGNOSTICS,prior);assert.equal(launch.args[0],'--import');assert.equal(launch.env.MODEL_BENCHMARK_GEMINI_HEADERS_TIMEOUT,'300000');const diagnosticArgs=['--require',path.join(runtime,'gemini-diagnostics.cjs'),main];
 const child=spawnSync(process.execPath,['--require',setup,...diagnosticArgs],{cwd:dir,env:{...process.env,...launch.env},encoding:'utf8',windowsHide:true});assert.equal(child.status,0);assert.match(child.stdout,/offline expected failure/);const raw=await fs.readFile(path.join(dir,geminiDiagnostics.logName),'utf8');assert.ok(!raw.includes('SECRET'));const records=raw.trim().split('\n').map(JSON.parse);assert.equal(records[0].event,'capture-ready');assert.equal(records[1].error.cause.code,'ENOTFOUND');assert.equal(records[1].category,'dns');
 assert.deepEqual(summarizeTransportLog(raw),{captureReady:true,privateLog:geminiDiagnostics.logName,errorCount:1,geminiApiErrorCount:1,otherFetchErrorCount:0,categoryCounts:{dns:1}});
 const disabled=await fs.mkdtemp(path.join(temp,'transport-disabled-'));const childEnv={...process.env};delete childEnv.MODEL_BENCHMARK_GEMINI_DIAGNOSTICS;const off=spawnSync(process.execPath,['--require',setup,...diagnosticArgs],{cwd:disabled,env:childEnv,encoding:'utf8',windowsHide:true});assert.equal(off.status,0);assert.equal(await fs.access(path.join(disabled,geminiDiagnostics.logName)).then(()=>true,()=>false),false);
});

test('runner carries only the diagnostic summaries into results; a skipped offline fixture never launches a model',async()=>{
 const dir=await fs.mkdtemp(path.join(temp,'diagnostic-result-')),out=path.join(dir,'results'),relative='models/fixture/diagnostic-fixture/run-offline',work=path.join(out,'private',relative),config=path.join(dir,'config.json');await fs.mkdir(work,{recursive:true});await fs.writeFile(path.join(dir,'prompt.txt'),'offline fixture');await fs.writeFile(path.join(work,'prompt.txt'),'offline fixture');
 const tools=summarizeToolResults([{type:'tool_result',status:'success',output:'{"status":"error"}'}]),transport=summarizeTransportLog('{"event":"capture-ready"}\n{"event":"http-error","scope":"gemini-api","category":"http-rate-limit"}\n');await fs.writeFile(path.join(work,'adapter-state.json'),JSON.stringify({status:'failed',toolExecutionSummary:tools,transportDiagnostics:transport,unrelatedSecret:'SECRET'}));
 await fs.writeFile(config,JSON.stringify({models:[{id:'fixture',command:process.execPath,args:[path.join(root,'development/fixture-io.mjs'),'file','{promptFile}'],promptMode:'file'}],tasks:[{id:'diagnostic-fixture',type:'writing',prompt:'prompt.txt',skipReason:'offline-only'}]}));
 await run(config,out,{viewer:false,publish:false,resumeTrial:{id:'offline',task:'diagnostic-fixture',model:'fixture',trialPath:relative}});const result=JSON.parse(await fs.readFile(path.join(out,'public',relative,'result.json'),'utf8'));assert.equal(result.status,'skipped');assert.deepEqual(result.toolExecutionSummary,tools);assert.deepEqual(result.transportDiagnostics,transport);assert.ok(!JSON.stringify(result).includes('SECRET'));
});
