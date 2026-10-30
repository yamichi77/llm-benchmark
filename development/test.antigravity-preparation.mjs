import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepare,mcpConfig,launchTemplate,agyModel,unresolved} from '../runtime/antigravity-3d-prepare.mjs';
import {effectivePrompt,imageNames} from '../runtime/gemini-policy.mjs';
import {mcpTools} from '../runtime/qwen-mcp-policy.mjs';
const projectRoot=process.env.MODEL_BENCHMARK_SOURCE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'model-benchmark-agy-preparation-'));
const runtime=path.join(projectRoot,'runtime');

test('prepare only the fixed uncompleted 3D: identical prompt/four PNGs, separate storage, zero invocations',async()=>{
 const result=await prepare({projectRoot,outRoot:temp,token:'offline-fixed',cli:'C:/fixture/agy.exe'}),work=result.work;
 assert.equal(result.inferenceStarted,false);assert.equal(result.cliInvocations,0);assert.equal(result.modelId,agyModel);assert.equal(result.status,'prepared-blocked');
 assert.equal(result.plannedCliInvocations,1);assert.equal(result.automaticScriptRetries,0);assert.deepEqual(result.mcpTools,mcpTools);assert.deepEqual(result.unresolved,unresolved);
 const config=JSON.parse(await fs.readFile(path.join(runtime,'benchmarks/v2/config-gemini.json'),'utf8')),task=config.tasks.find(t=>t.id==='model3d-kurageko-v2');
 const original=await fs.readFile(path.join(runtime,'benchmarks/v2',task.prompt));assert.deepEqual(await fs.readFile(path.join(work,'prompt.txt')),original);
 assert.equal(await fs.readFile(path.join(work,'effective-prompt.txt'),'utf8'),effectivePrompt(original.toString('utf8'),'model3d'));
 assert.deepEqual((await fs.readdir(path.join(work,'input'))).sort(),[...imageNames].sort());
 for(const name of imageNames)assert.deepEqual(await fs.readFile(path.join(work,'input',name)),await fs.readFile(path.join(task.input,name)));
 assert.deepEqual(await fs.readdir(path.join(work,'artifacts')),[]);assert.ok(work.includes('gemini-4-argon-agy-pro-medium'));
 assert.equal(await fs.access(path.join(work,'adapter-state.json')).then(()=>true,()=>false),false);
 await assert.rejects(prepare({projectRoot,outRoot:temp,token:'offline-fixed'}),e=>e.code==='EEXIST');
 await assert.rejects(prepare({projectRoot,outRoot:temp,token:'../old-run'}),/Unsafe/);
});

test('workspace MCP exposes the same six tools without global settings, permission bypass, or timeout edits',()=>{
 const config=mcpConfig(runtime,temp),server=config.mcpServers.blender_benchmark;
 assert.deepEqual(Object.keys(config.mcpServers),['blender_benchmark']);assert.deepEqual(server.enabledTools,mcpTools);
 assert.ok(server.args[0].endsWith('launch-opus.py'));assert.equal(server.cwd,temp);assert.equal(server.env.MODEL_BENCHMARK_WORKDIR,temp);assert.equal(server.env.MODEL_BENCHMARK_BLENDER_PORT,'9877');
 for(const key of ['trust','headers','serverUrl','authProviderType','timeoutSeconds'])assert.equal(Object.hasOwn(server,key),false);
 assert.throws(()=>mcpConfig(runtime,temp,9999),/Unsupported/);
 const script=launchTemplate('C:/fixture/agy.exe');assert.equal((script.match(/^& /gm)||[]).length,1);assert.ok(script.includes('--model gemini-4-argon-medium --effort medium'));
 assert.ok(script.includes('--output-format stream-json'));assert.ok(script.includes('--print-timeout 0'));
 assert.equal(/dangerously-skip|--continue|--conversation|while\s*\(|for\s*\(|AI_CREDITS|modelProvider/.test(script),false);
});

test('installed Blender MCP registers precisely six tools without event-loop sockets, process startup, or network',()=>{
 const python='C:/Users/PUBLIC_USER/Desktop/ツール/charakuru-1.0.3/local/blender-mcp-venv/Scripts/python.exe';
 // Registration/listing does no async I/O. Drive that coroutine directly and fail
 // if it ever suspends; do not create Windows asyncio's loopback socketpair.
 const code=`import importlib.util, json, socket, subprocess\nfrom unittest.mock import patch\ndef no_io(coro):\n try:\n  coro.send(None)\n except StopIteration as done:\n  return done.value\n else:\n  coro.close()\n  raise RuntimeError('Offline registration unexpectedly requires async I/O')\nspec=importlib.util.spec_from_file_location('trial_mcp',${JSON.stringify(path.join(runtime,'integrations/blender/launch-opus.py'))})\nmodule=importlib.util.module_from_spec(spec)\nwith patch.object(socket.socket,'connect',side_effect=RuntimeError('network forbidden')), patch.object(socket.socket,'connect_ex',side_effect=RuntimeError('network forbidden')), patch.object(socket,'socketpair',side_effect=RuntimeError('socketpair forbidden')), patch.object(subprocess,'Popen',side_effect=RuntimeError('process forbidden')):\n spec.loader.exec_module(module)\n with patch.object(module.asyncio,'run',side_effect=no_io):\n  server=module.build_server()\n  tools=no_io(server.list_tools())\n print(json.dumps(sorted(t.name for t in tools)))\n`;
 const result=spawnSync(python,['-B','-c',code],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout.trim()),[...mcpTools].sort());
});

test('PowerShell parses the non-executable launch template without running it',async()=>{
 const file=path.join(temp,'pending-launch.ps1.txt');await fs.writeFile(file,launchTemplate("C:/fixture/user's agy.exe"));
 const command="$errorsFound=$null; $tokensFound=$null; [System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokensFound,[ref]$errorsFound) > $null; if ($errorsFound.Count) { exit 1 }";
 // Pass the path as data through a fixed single-quoted literal, never execute the parsed AST.
 const result=spawnSync('powershell.exe',['-NoProfile','-Command',command.replace('$args[0]',"'"+file.replaceAll("'","''")+"'")],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stderr);
});
