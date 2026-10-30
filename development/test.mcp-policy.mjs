import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import {mcpServer,mcpTools,mcpPermissionRules} from '../runtime/qwen-mcp-policy.mjs';
import {evaluatePermissionFlow,needsConfirmation} from 'file:///C:/Users/PUBLIC_USER/AppData/Local/qwen-code/qwen-code/lib/chunks/chunk-X5CTAVPR.js';
// PermissionManager is internal in this CLI build. Evaluate its unchanged class
// with the installed parser/matcher dependencies; never modify the installation.
import * as nativeRules from 'file:///C:/Users/PUBLIC_USER/AppData/Local/qwen-code/qwen-code/lib/chunks/chunk-FQQMMFT6.js';
import * as nativeConstants from 'file:///C:/Users/PUBLIC_USER/AppData/Local/qwen-code/qwen-code/lib/chunks/chunk-2UNFJQ2D.js';
const nativeSource=fs.readFileSync('C:/Users/PUBLIC_USER/AppData/Local/qwen-code/qwen-code/lib/chunks/chunk-X5CTAVPR.js','utf8');
const start=nativeSource.indexOf('var PermissionManager=class'),end=nativeSource.indexOf(';init_esbuild_shims()',start);
assert.ok(start>=0&&end>start,'installed PermissionManager boundary must be recognized');
assert.ok(nativeConstants.ToolNames,'installed tool names available');
const deps={...nativeRules,ToolNames:nativeConstants.ToolNames,__name:fn=>fn,DECISION_PRIORITY:{deny:3,ask:2,default:1,allow:0}};
const PermissionManager=new Function(...Object.keys(deps),nativeSource.slice(start,end)+';return PermissionManager;')(...Object.values(deps));
const identities=[...mcpTools.map(serverToolName=>({serverName:mcpServer,serverToolName})),{serverName:'other_server',serverToolName:'execute_blender_code'},{serverName:mcpServer,serverToolName:'execute_blender_code_for_cli'}];
function configuration(rules){let pm;const config={getPermissionsAllow:()=>rules,getPermissionsAsk:()=>[],getPermissionsDeny:()=>Object.values(nativeConstants.ToolNames).filter(name=>name!=='read_file'),getApprovalMode:()=> 'default',getToolRegistry:()=>({getMcpToolIdentities:()=>identities}),getTargetDir:()=>process.cwd(),getPermissionManager:()=>pm};pm=new PermissionManager(config);pm.initialize();return config;}
async function decision(config,toolName,identity){const invocation={getDefaultPermission:async()=> 'ask',mcpIdentity:identity,permissionAliases:[]};const flow=await evaluatePermissionFlow(config,invocation,toolName,{},new AbortController().signal);return {permission:flow.finalPermission,requiresConfirmation:needsConfirmation(flow.finalPermission,'default',toolName)};}
test('installed CLI reproduces old bare-name MCP permission failure',async()=>{const d=await decision(configuration(mcpTools),mcpPermissionRules[0],identities[0]);assert.deepEqual(d,{permission:'ask',requiresConfirmation:true});});
test('exact six fully qualified tools are allowed without confirmation',async()=>{const c=configuration(mcpPermissionRules);for(let i=0;i<mcpTools.length;i++)assert.deepEqual(await decision(c,mcpPermissionRules[i],identities[i]),{permission:'allow',requiresConfirmation:false},mcpTools[i]);});
test('unlisted MCP asks; excluded shell and file-write are denied',async()=>{const c=configuration(mcpPermissionRules);for(const [name,identity] of [['mcp__other_server__execute_blender_code',identities[6]],['mcp__blender_benchmark__execute_blender_code_for_cli',identities[7]]])assert.deepEqual(await decision(c,name,identity),{permission:'ask',requiresConfirmation:true},name);for(const name of ['run_shell_command','write_file'])assert.deepEqual(await decision(c,name,undefined),{permission:'deny',requiresConfirmation:false},name);});
test('adapter uses one exact allowlist, keeps server trust false and excludes native shell',()=>{const src=fs.readFileSync(new URL('../runtime/qwen-code-run.mjs',import.meta.url),'utf8');assert.ok(src.includes('...(mcpMode?mcpPermissionRules:[])'));assert.ok(src.includes('includeTools:mcpTools,trust:false'));assert.ok(src.includes('const excluded=allTools.filter(x=>!readTools.includes(x))'));assert.ok(!src.includes("'--allowed-tools',...mcpTools"));assert.ok(mcpPermissionRules.every(x=>!x.includes('*')));});
