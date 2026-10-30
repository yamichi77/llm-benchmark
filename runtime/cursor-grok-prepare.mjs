import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Preparation-only adapter: deliberately has no inference command or credential access.
export function preparation(config) {
  const blockers = [
    'Native Windows filesystem isolation unavailable: official sandbox probe failed with SandboxUnsupportedError',
    'Grok High non-Fast appears in authenticated catalog; effective request configuration has not been verified',
    'Zero additional spending is user-confirmed; live included-pool balance is not exposed by inspected CLI commands',
    'Fixed input contains .env; no input has been sent; secret-bearing files must be excluded before transmission',
    'Live adapter integration held; no insecure_none, WSL migration, permission changes or inference attempted'
  ];
  if (config.preparationOnly !== true || config.models.length !== 1 || config.models[0].modelId !== null || config.speed !== 'standard') throw Error('Unsafe preparation configuration');
  return {ready:false, preparationOnly:true, data:[], blockers, modelInferenceRequests:0,
    documentedBaseModel:'grok-4.7', verifiedCatalogModel:'grok-4.7-high', intendedEffort:'high', verifiedExecutableModel:null, speed:'standard',
    cliVersion:'2026.10.22-27dcf5f', auth:'logged-in (read-only status confirmed)', subscriptionTier:'Premium', billing:'included pool only; additional spending and prepaid consumption forbidden; no API fallback',
    endpoint:'https://api2.cursor.sh', threeDimensionalExecution:'held'};
}
async function main() {
  if (!process.argv.slice(2).every(a=>['--prepare','--models'].includes(a)) || !process.argv.slice(2).length) {
    console.error('Preparation-only adapter; inference is not implemented or authorized.'); process.exitCode=78; return;
  }
  const runtime=path.dirname(fileURLToPath(import.meta.url));
  const config=JSON.parse(await fs.readFile(path.join(runtime,'benchmarks/v2/config-grok-preparation.json'),'utf8'));
  const info=preparation(config);
  for(const task of config.tasks) {
    await fs.access(path.resolve(runtime,'benchmarks/v2',task.prompt));
    if(task.input) await fs.access(path.resolve(runtime,'benchmarks/v2',task.input));
  }
  console.log(JSON.stringify(info,null,2)); process.exitCode=78;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
