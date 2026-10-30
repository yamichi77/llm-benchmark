import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const httpPolicyFile='gemini-http-policy.json';
export const httpTransportPolicy=Object.freeze({mechanism:'benchmark-scoped-node-import-v1',cliVersion:'0.65.0',publicCliSetting:false,baselineHeadersTimeoutMs:60000,headersTimeoutMs:300000,bodyTimeoutMs:300000,maxAttempts:1,retryFetchErrors:false,comparisonConditionChanged:true});
const runtime=path.dirname(fileURLToPath(import.meta.url));
export function isCliWorker(env){return Boolean(env.GEMINI_CLI_NO_RELAUNCH||env.SANDBOX);}

// The CLI's later refreshAuth initialization calls this getter before updating
// its dispatcher. Pin that same getter in this process so it cannot reset us.
export function installHeaderTimeout(core){
 const proto=core.Config?.prototype,original=proto&&Object.getOwnPropertyDescriptor(proto,'getRequestTimeoutMs');
 if(typeof original?.value!=='function'||!original.value.toString().includes('DEFAULT_REQUEST_TIMEOUT')||typeof core.updateGlobalFetchTimeouts!=='function')throw Error('Unsupported Gemini HTTP initialization API; no request started');
 core.updateGlobalFetchTimeouts(httpTransportPolicy.headersTimeoutMs);
 Object.defineProperty(proto,'getRequestTimeoutMs',{...original,value:function(){return httpTransportPolicy.headersTimeoutMs;}});
 return ()=>{Object.defineProperty(proto,'getRequestTimeoutMs',original);core.updateGlobalFetchTimeouts(httpTransportPolicy.baselineHeadersTimeoutMs);};
}

async function bootstrap(){
 const bundle=path.join(path.dirname(process.execPath),'node_modules/@google/gemini-cli/bundle'),cli=path.join(bundle,'gemini.js');
 const pkg=JSON.parse(await fs.readFile(path.join(bundle,'../package.json'),'utf8'));
 const entry=await fs.readFile(cli,'utf8'),relauncher=await fs.readFile(path.join(bundle,'chunk-GFC74TMK.js'),'utf8');
 if(pkg.version!==httpTransportPolicy.cliVersion||path.resolve(process.argv[1]||'')!==path.resolve(cli)||!entry.includes('import "./chunk-DKZARV6U.js";')||!entry.includes('GEMINI_CLI_NO_RELAUNCH')||!relauncher.includes('...process.execArgv'))throw Error('Unsupported Gemini entry/relaunch layout; no request started');
 // --import is preserved by getSpawnConfig(...process.execArgv). The outer
 // memory/relaunch process must not create the exclusive diagnostics log.
 if(!isCliWorker(process.env))return;
 if(process.env.MODEL_BENCHMARK_GEMINI_DIAGNOSTICS!=='1')throw Error('Benchmark diagnostics are required; no request started');
 createRequire(import.meta.url)(path.join(runtime,'gemini-diagnostics.cjs'));
 const core=await import(pathToFileURL(path.join(bundle,'chunk-DKZARV6U.js')));
 installHeaderTimeout(core);
 await fs.writeFile(path.join(process.cwd(),httpPolicyFile),JSON.stringify({...httpTransportPolicy,applied:true,phase:'cli-worker-startup',laterConfigGetterPinned:true},null,2),{flag:'wx',mode:0o600});
}
if(process.env.MODEL_BENCHMARK_GEMINI_HEADERS_TIMEOUT==='300000')await bootstrap();
