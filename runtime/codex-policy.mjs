import path from 'node:path';
import {mcpConfiguration} from './opus-policy.mjs';
export const solModel='gpt-6.1-sol',solEffort='medium';
export function solArguments(kind,{runtime,work,sessionId,images=[],modelId=solModel,trialWrite=false}={}){
 if(![solModel,'gpt-6-astra'].includes(modelId))throw Error('Unapproved benchmark model');
 const values={model:modelId,model_provider:'openai',model_reasoning_effort:solEffort,approval_policy:'never',sandbox_mode:'read-only',web_search:'disabled',project_doc_max_bytes:0,'skills.include_instructions':false,'skills.bundled.enabled':false,'analytics.enabled':false,'features.shell_tool':false,'features.unified_exec':false,'features.apply_patch_freeform':false,'features.multi_agent':false,'features.multi_agent_v2':false,'features.apps':false,'features.plugins':false,'features.memories':false,'features.memory_tool':false,'features.hooks':false,'features.view_image':false};
 if(kind==='research')Object.assign(values,{'mcp_servers.benchmark_inputs.command':process.execPath,'mcp_servers.benchmark_inputs.args':[path.join(runtime,'input-mcp.mjs')],'mcp_servers.benchmark_inputs.env':{MODEL_BENCHMARK_INPUT:path.join(work,'input')},'mcp_servers.benchmark_inputs.enabled_tools':['list_files','read_file'],'mcp_servers.benchmark_inputs.required':true});
 if(kind==='model3d'){const s=mcpConfiguration(runtime,work).mcpServers.blender_benchmark;Object.assign(values,{'mcp_servers.blender_benchmark.command':s.command,'mcp_servers.blender_benchmark.args':s.args,'mcp_servers.blender_benchmark.env':s.env,'mcp_servers.blender_benchmark.enabled_tools':['execute_blender_code','get_objects_summary','get_object_detail_summary','search_api_docs','search_manual_docs','render_thumbnail_to_path'],'mcp_servers.blender_benchmark.required':true});}
 if(trialWrite){if(modelId!=='gpt-6-astra'||kind!=='model3d')throw Error('Trial write is approved only for Astra 3D');const approved=path.resolve(runtime,'../results/private/models/gpt-6-astra-code/model3d-kurageko-v2'),relative=path.relative(approved,path.resolve(work));if(!/^run-[A-Za-z0-9_-]+$/.test(relative))throw Error('Write root must be the exact Astra 3D trial');delete values.sandbox_mode;Object.assign(values,{default_permissions:'astra_trial','permissions.astra_trial.extends':':read-only','permissions.astra_trial.filesystem':{[path.resolve(work).replaceAll('\\','/')]: 'write'},'permissions.astra_trial.network.enabled':false});}
 Object.assign(values,{'features.code_mode':false,'features.skip_host_skill_discovery':true});
 if(kind==='research')for(const name of ['list_files','read_file'])values['mcp_servers.benchmark_inputs.tools.'+name+'.approval_mode']='approve';
 if(kind==='model3d')for(const name of ['execute_blender_code','get_objects_summary','get_object_detail_summary','search_api_docs','search_manual_docs','render_thumbnail_to_path'])values['mcp_servers.blender_benchmark.tools.'+name+'.approval_mode']='approve';
 const toml=v=>v&&typeof v==='object'&&!Array.isArray(v)?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+'='+toml(x)).join(',')+'}':JSON.stringify(v);
 const args=['exec',...(sessionId?['resume']:[]),'--ignore-user-config','--strict-config','--skip-git-repo-check','--json','--model',modelId];
 for(const [k,v]of Object.entries(values))args.push('-c',k+'='+toml(v));
 for(const image of images)args.push('--image',image);
 args.push('--output-last-message',path.join(work,'codex-final.txt'));
 if(sessionId)args.push(sessionId);args.push('-');return args;
}
