// Preparation only. This module never starts agy, Blender, a listener, or an API request.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {imageNames,effectivePrompt} from './gemini-policy.mjs';
import {mcpTools} from './qwen-mcp-policy.mjs';
import {mcpConfiguration} from './opus-policy.mjs';

export const agyModel='gemini-4-argon-medium';
export const agyVersion='1.4.7';
export const storageModel='gemini-4-argon-agy-pro-medium';
export const taskId='model3d-kurageko-v2';
export const unresolved=Object.freeze([
 'The existing agy MCP permission decision and exclusion of other global/plugin tools have not been verified. No permission or global setting was changed.',
 'The four PNGs are copied and referenced using the same effective prompt as the prior Gemini run; native agy headless visual attachment ingestion has not been observed.',
 'Exactly one CLI invocation and no script retry are specified. A supported agy 1.4.7 switch to disable internal transport retries was not found; API maxAttempts=1 equivalence is unverified.',
 'Direct headless scripting is documented. Consumer-plan acceptance of this exact benchmark workflow is not independently confirmed; no third-party agent adapter was added.'
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";

export function mcpConfig(runtime,work,port=9877){
 if(![9877,9878].includes(port))throw Error('Unsupported dedicated Blender port');
 const server=mcpConfiguration(runtime,work).mcpServers.blender_benchmark;
 const {type,...stdio}=server;
 return {mcpServers:{blender_benchmark:{...stdio,cwd:work,env:{...stdio.env,MODEL_BENCHMARK_BLENDER_PORT:String(port)},enabledTools:[...mcpTools]}}};
}

export function launchTemplate(cli){
 // A text template, not an executable script or runner adapter. Do not use before blockers are resolved.
 return `# NOT READY: preparation.json lists unresolved preconditions. This is a review template only.\n# Direct official CLI invocation, one fixed prompt, no continuation/account rotation/retry loop.\nSet-StrictMode -Version Latest\n$ErrorActionPreference = 'Stop'\nSet-Location -LiteralPath $PSScriptRoot\n$fixedPrompt = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'effective-prompt.txt'), [Text.Encoding]::UTF8)\n# A future execution must create its attempt marker exclusively before invoking agy.\n& ${quote(cli)} --model ${agyModel} --effort medium --mode accept-edits --disable-slash-commands --print $fixedPrompt --output-format stream-json --print-timeout 0\n# Save stdout/stderr privately and import the terminal result offline after the run; never regenerate on failure.\n`;
}

export async function prepare({projectRoot,token='prepared-'+new Date().toISOString().replace(/[:.]/g,'-'),outRoot,cli=path.join(process.env.LOCALAPPDATA||'','agy/bin/agy.exe'),port=9877}){
 if(!/^[A-Za-z0-9_-]+$/.test(token))throw Error('Unsafe new-trial identifier');
 const runtime=path.join(projectRoot,'runtime'),config=JSON.parse(await fs.readFile(path.join(runtime,'benchmarks/v2/config-gemini.json'),'utf8'));
 const task=config.tasks.find(t=>t.id===taskId);
 if(task?.type!=='model3d'||task.promptVersion!=='model3d-kurageko-v2-mcp1'||task.prompt!=='model3d-mcp-ja.txt')throw Error('Fixed 3D benchmark definition changed');
 const sourcePrompt=await fs.readFile(path.join(runtime,'benchmarks/v2',task.prompt));
 const input=await fs.realpath(path.resolve(runtime,'benchmarks/v2',task.input));
 const images=[];
 for(const name of imageNames){const data=await fs.readFile(path.join(input,name));if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Fixed reference is not a PNG');images.push({name,data});}
 const work=path.join(outRoot||path.join(projectRoot,'results/private'),'models',storageModel,taskId,'run-'+token);
 // Refuse all reuse, including partially prepared directories. Historical runs are never opened for write.
 await fs.mkdir(path.dirname(work),{recursive:true});await fs.mkdir(work);
 await fs.mkdir(path.join(work,'input'));await fs.mkdir(path.join(work,'artifacts'));await fs.mkdir(path.join(work,'.agents'));
 await fs.writeFile(path.join(work,'prompt.txt'),sourcePrompt,{flag:'wx'});
 for(const image of images)await fs.writeFile(path.join(work,'input',image.name),image.data,{flag:'wx'});
 await fs.writeFile(path.join(work,'effective-prompt.txt'),effectivePrompt(sourcePrompt.toString('utf8'),'model3d'),{flag:'wx'});
 await fs.writeFile(path.join(work,'.agents/mcp_config.json'),JSON.stringify(mcpConfig(runtime,work,port),null,2),{flag:'wx'});
 await fs.writeFile(path.join(work,'pending-launch.ps1.txt'),launchTemplate(cli),{flag:'wx'});
 const state={status:'prepared-blocked',inferenceStarted:false,cliInvocations:0,plannedCliInvocations:1,automaticScriptRetries:0,cliVersion:agyVersion,modelId:agyModel,thinking:'MEDIUM',task:taskId,promptVersion:task.promptVersion,inputVersion:task.inputVersion,promptSha256:sha(sourcePrompt),images:images.map(({name,data})=>({name,sha256:sha(data)})),mcpTools:[...mcpTools],mcpPort:port,billingRoute:'existing Google AI Pro login; parent verified, not inspected by this preparer',useAiCredits:'off per parent verification; unchanged',modelProviderOverride:'none; no override added',sourceRoute:'official agy direct headless template, separate from generic runner',comparisonChanges:['Gemini CLI/API to Antigravity CLI/Google AI Pro','Model slug pins medium; API maxOutputTokens=65536 cannot be pinned through installed help','Old Gemini headersTimeout bootstrap does not apply to agy; agy HTTP timeout/retry behavior unverified','MCP transport uses documented agy defaults; no timeout override added'],unresolved:[...unresolved],preparedAt:new Date().toISOString()};
 await fs.writeFile(path.join(work,'preparation.json'),JSON.stringify(state,null,2),{flag:'wx'});
 return {work,...state};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 if(process.argv.length!==2)throw Error('Preparation only; execution/import arguments are not supported');
 prepare({projectRoot}).then(({work,status,inferenceStarted})=>console.log(JSON.stringify({work,status,inferenceStarted}))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
