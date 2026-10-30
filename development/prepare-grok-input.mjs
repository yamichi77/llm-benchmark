import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const nameAllowed=p=>!p.split('/').some(n=>n.startsWith('.')||/^(node_modules|dist|build|coverage)$/i.test(n)||/(secret|credential|password|token|private.key)/i.test(n))&&/\.(md|json|tsx?|jsx?|mjs|cjs|css|html|ya?ml)$/i.test(p)&&!/(?:^|\/)(?:package-lock|pnpm-lock|yarn.lock)/.test(p);
// Conservative literal-credential screening. Values are never returned or logged.
export const sensitiveText=s=>/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{25,})|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[=:]\s*["'][^"'\r\n]{8,}["']/i.test(s);
export async function prepareInput(source,dest){
 const root=await fs.realpath(source),allow=[],excluded=[];
 await fs.mkdir(dest,{recursive:false});
 async function visit(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,e.name),rel=path.relative(root,file).replaceAll('\\','/');
  if(e.isSymbolicLink()){excluded.push({path:rel,reason:'symbolic-link'});continue;}
  if(e.isDirectory()){if(e.name.startsWith('.')||/^(node_modules|dist|build|coverage)$/i.test(e.name)){excluded.push({path:rel+'/',reason:'excluded-directory'});continue;}await visit(file);continue;}
  if(!e.isFile()||!nameAllowed(rel)){excluded.push({path:rel,reason:'not-in-source-text-allowlist'});continue;}
  const real=await fs.realpath(file);if(!real.startsWith(root+path.sep))throw Error('Source path escaped fixed root');
  const data=await fs.readFile(real);if(data.includes(0)||sensitiveText(data.toString('utf8'))){excluded.push({path:rel,reason:'binary-or-potential-credential'});continue;}
  const to=path.join(dest,rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,data,{flag:'wx'});allow.push(rel);
 }}await visit(root);
 const manifest={sourceCommit:'b3a3d3568846d1b154e891fc4683c1eea73263ee',inputVersion:'b3a3d3568846d1b154e891fc4683c1eea73263ee-grok-source-allowlist-v1',allowlist:allow.sort(),excluded:excluded.sort((a,b)=>a.path.localeCompare(b.path)),transmitted:false,readyForTransmission:false,limitation:'Conservative filename and literal-pattern screening is not proof of absence of all secrets; final input review and working filesystem isolation required.',comparisonDifference:'Source-text subset only; dotfiles, lockfiles, binary assets and credential candidates excluded. Other models may have had a different readable input set; no claim about their actual transmission.'};
 await fs.writeFile(dest+'-allowlist.json',JSON.stringify(manifest,null,2),{flag:'wx'});
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [source,dest]=process.argv.slice(2);if(!source||!dest)throw Error('Usage: prepare-grok-input.mjs SOURCE NEW_DEST');
 const m=await prepareInput(source,dest);console.log(JSON.stringify({allowlisted:m.allowlist.length,excluded:m.excluded.length,readyForTransmission:m.readyForTransmission,transmitted:false}));
}
