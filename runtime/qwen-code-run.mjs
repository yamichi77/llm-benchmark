import {fileURLToPath} from 'node:url';
import {mcpTools,mcpPermissionRules} from './qwen-mcp-policy.mjs';
import {createWriteStream} from 'node:fs';
import {qwenEnvironment} from './qwen-stream-policy.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {packGltf} from './gltf-pack.mjs';
const install='C:/Users/PUBLIC_USER/AppData/Local/qwen-code/qwen-code';
const model='qwen3.8-flash-next-orca-uncensored-bf16-mtp',endpoint='http://dgx.home:30001/v1';
const option=name=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1];};
if(process.argv[2]==='--models'){const response=await fetch(endpoint+'/models');if(!response.ok)throw Error('Model listing HTTP '+response.status);console.log(JSON.stringify(await response.json()));}
else {
 let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
 const usingMcp=process.argv.includes('--blender-mcp');
 const version=option('--prompt-version')||'unversioned',research=version.startsWith('research-'),model3d=version.startsWith('model3d-');
 const constants=await fs.readFile(install+'/lib/chunks/chunk-2UNFJQ2D.js','utf8');
 const match=constants.match(/var ToolNames=(\{[^;]+\});var AGENT_HOST_TOOL_NAMES/);if(!match)throw Error('Cannot verify tool names for this installed version');
 const allTools=[...match[1].matchAll(/:"([^"]+)"/g)].map(x=>x[1]);if(allTools.length<40)throw Error('Incomplete tool exclusions');
 const readTools=research?['read_file','list_directory','glob','grep_search']:model3d?['read_file']:[];
 if(research||model3d){
  const input=await fs.realpath(option('--input'));await fs.cp(input,'input',{recursive:true,errorOnExist:true,force:false});
  prompt+=(usingMcp?'\n\nMCP制作条件：公式Blender MCPを使い、専用Blender内で制作してください。ファイルの読取りはこの試行の input/、書込みはこの試行フォルダと artifacts/ だけ。外部通信、外部ファイル参照、依存インストール、元キャラやユーザー設定の変更は禁止です。artifact.glb と編集可能な .blend または制作Pythonを保存してください。GLBはキャラクターだけを書き出し、最終回答には保存先と完成状況を簡潔に記してください。出力先の絶対パス：'+option('--output')+'\n':'');
  prompt+='\n\n実行入力：作業フォルダの input/ に固定素材があります。'+(usingMcp?'許可されたMCP制作ツールと画像読み取りを使えます。shell・外部通信は禁止です。':'許可ツールはその素材の読み取りだけです。外部ファイルを読まず、書込み・shell・ネットワークは使いません。')+'\n';
  prompt+=research?'最初に input/README.md と input/package.json を読み、必要な実装を read_file/list_directory/glob/grep_search で確認してください。':'必ず4枚を画像として読み込んでから制作してください。画像が非対応なら制作したふりをせず IMAGE_INPUT_UNSUPPORTED と理由だけを返してください。\n@input/front.png\n@input/right.png\n@input/back.png\n@input/design-turnaround.png';
 }
 const mcpMode=process.argv.includes('--blender-mcp');
 const excluded=allTools.filter(x=>!readTools.includes(x));
 const args=[install+'/lib/cli-entry.js',...(mcpMode?['--bare']:['--safe-mode']),'--approval-mode','default','--auth-type','openai','--openai-base-url',endpoint,'--model',model,'--advisor','off','--chat-recording=false','--telemetry=false','--output-format','json',...(readTools.length?['--allowed-tools',...readTools.map(t=>t+'(./input/**)'),...(mcpMode?mcpPermissionRules:[])]:[]),'--exclude-tools',...excluded,'--prompt',prompt];
 if(mcpMode){
  const mcpFile=path.resolve('benchmark-mcp.json');
  await fs.writeFile(mcpFile,JSON.stringify({mcpServers:{blender_benchmark:{command:"C:/Users/PUBLIC_USER/Desktop/ツール/charakuru-1.0.3/local/blender-mcp-venv/Scripts/python.exe",args:[fileURLToPath(new URL('./integrations/blender/launch.py',import.meta.url))],cwd:process.cwd(),includeTools:mcpTools,trust:false}}},null,2));
  args.push('--mcp-config',mcpFile,'--allowed-mcp-server-names','blender_benchmark');
 }
 const invocation={cliVersion:'0.25.3',command:process.execPath,args,model,endpoint,approvalMode:'default',tools:readTools,reasoningEffort:'not explicitly set; server template default xhigh',thinking:'not explicitly set; server template default enabled',promptVersion:version,streamPolicy:{streamMaxLifetimeMs:0,idleTimeout:'existing provider/env/default preserved',scope:'benchmark child process only'}};
 await fs.writeFile('effective-prompt.txt',prompt);await fs.writeFile('qwen-invocation.json',JSON.stringify(invocation,null,2));
 if(mcpMode)invocation.mcp={server:'blender_benchmark',tools:mcpTools,approval:'explicit fully qualified selected tools only',permissionRules:mcpPermissionRules,scope:'this trial',blenderOfflineMode:true,outputDirectory:option('--output')};
 await fs.writeFile('qwen-invocation.json',JSON.stringify(invocation,null,2));
 const childEnv=qwenEnvironment(process.env);
 if(mcpMode)childEnv.PYTHONDONTWRITEBYTECODE='1';
 if(model3d){
  const user=JSON.parse(await fs.readFile('C:/Users/PUBLIC_USER/.qwen/settings.json','utf8'));
  const configured=user.modelProviders?.openai?.find(p=>p.id===model);if(!configured)throw Error('Configured model metadata missing');
  if(mcpMode){const existing=user.env?.[configured.envKey];if(typeof existing!=='string'||!existing)throw Error('Existing local provider authentication unavailable');childEnv[configured.envKey]=existing;childEnv.OPENAI_API_KEY=existing;invocation.authenticationSource='existing configured local provider env; child process only; value omitted';}

  const provider={id:model,...(configured.envKey?{envKey:configured.envKey}:{}),baseUrl:endpoint,generationConfig:{...configured.generationConfig,modalities:{...configured.generationConfig?.modalities,image:true}}};
  const capabilityFile=path.resolve('provider-capabilities.json');await fs.writeFile(capabilityFile,JSON.stringify({modelProviders:{openai:[provider]}},null,2));
  childEnv.QWEN_CODE_SYSTEM_SETTINGS_PATH=capabilityFile;
  invocation.imageInput={enabled:true,scope:'per-trial capability metadata; global settings unchanged',references:4};await fs.writeFile('qwen-invocation.json',JSON.stringify(invocation,null,2));
 }
 const child=spawn(invocation.command,args,{cwd:process.cwd(),env:childEnv,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 if(mcpMode){const liveOut=createWriteStream('qwen-live.stdout.jsonl'),liveErr=createWriteStream('qwen-live.stderr.log');child.stdout.pipe(liveOut);child.stderr.pipe(liveErr);await fs.writeFile('qwen-process.json',JSON.stringify({pid:child.pid,startedAt:new Date().toISOString(),condition:'official-blender-lab-mcp'}));}
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const stop=()=>child.kill('SIGTERM');process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});process.off('SIGINT',stop);process.off('SIGTERM',stop);
 await fs.writeFile('qwen-raw.stdout.json',stdout);await fs.writeFile('qwen-raw.stderr.log',stderr);
 if(code!==0){console.error('Qwen Code exited '+code+'; raw output saved privately.');process.exitCode=code||1;}
 else {const parsed=JSON.parse(stdout),result=Array.isArray(parsed)?parsed.findLast(x=>x.type==='result'):parsed;await fs.writeFile('qwen-result.json',JSON.stringify(result,null,2));if(result.permission_denials?.length){console.error('Qwen Code requested permission; no automatic response.');process.exitCode=77;}else if(result.is_error){console.error('Qwen Code reported execution error; see private result.');process.exitCode=1;}else if(typeof result.result==='string'){
  process.stdout.write(result.result);
  if(model3d&&!mcpMode){await fs.writeFile('model-source.gltf',result.result);if(result.result.includes('IMAGE_INPUT_UNSUPPORTED')){console.error('Image input unsupported; see raw CLI result.');process.exitCode=78;}else await packGltf(result.result,path.join(option('--output'),'artifact.glb'));}
 }else throw Error('No final text in CLI result; raw first output retained');}
}
