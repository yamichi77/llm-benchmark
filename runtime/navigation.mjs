import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {threeClassic} from './three-classic.mjs';
const home=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(home);
// 「結果を見る.html」はダブルクリック（file://）で開く入口。file://ではfetchとES moduleが使えないため、
// 成果（本文・LPのHTML・GLB）とthree.jsはresults/public/entry/にクラシックスクリプトとして書き出す。
const script=v=>JSON.stringify(v).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const attr=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const posix=p=>p.split(path.sep).join('/');
const readJson=async f=>JSON.parse((await fs.readFile(f,'utf8')).replace(/^\uFEFF/,''));
const exists=f=>fs.access(f).then(()=>true,()=>false);
const hasArtifact=r=>typeof r.artifact==='string'&&(r.status==='success'||r.artifactRecoveredFromFinalText||r.artifactRecoveredFromModelFiles);
function inside(root,relative){if(relative.includes('\\')||path.isAbsolute(relative))throw Error('Unsafe artifact path');const p=path.resolve(root,relative);if(!p.startsWith(root+path.sep))throw Error('Artifact escapes public directory');return p;}
function glbBase64(buf){if(buf.length<20||buf.readUInt32LE(0)!==0x46546c67||buf.readUInt32LE(16)!==0x4e4f534a)throw Error('GLBではありません');const doc=JSON.parse(buf.subarray(20,20+buf.readUInt32LE(12)).toString('utf8'));if([...(doc.buffers||[]),...(doc.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw Error('外部ファイルを参照するGLBは表示しません');return buf.toString('base64');}
async function modelLabels(records=[]){
 const labels={};let candidates=[],configs=[];
 try{candidates=await readJson(path.join(home,'candidates.json'));}catch{}
 try{const c=await readJson(path.join(home,'current.json'));configs=[c.config,c.model3dConfig].filter(x=>typeof x==='string');}catch{}
 for(const file of configs){try{for(const m of (await readJson(path.join(repo,file))).models||[]){const c=candidates.find(x=>x.modelId&&x.modelId===m.modelId);for(const k of [m.id,m.storageModelKey])if(k)labels[k]={label:c?.label||null,modelId:m.modelId||null,note:c?.status||null};}}catch{}}
 for(const r of records){const k=r.storageModelKey||r.model;if(!labels[k]&&r.modelId){const c=candidates.find(c=>c.modelId===r.modelId);labels[k]={label:c?.label||null,modelId:r.modelId,note:null};}}
 return {labels,configs};
}
export async function navigation(project,data,results=path.join(project,'results')){
 const pub=path.join(results,'public'),entry=path.join(pub,'entry'),assets=path.join(entry,'assets'),base=posix(path.relative(project,results))+'/',publicBase=encodeURI(base+'public/');
 if(base.startsWith('../')||path.isAbsolute(base))throw Error('Results must be inside the project');
 await fs.mkdir(assets,{recursive:true});
 await fs.writeFile(path.join(entry,'three.js'),await threeClassic(path.join(repo,'node_modules','three')));
 for(const f of ['lp-frame.js','lp.html'])await fs.copyFile(path.join(home,'entry',f),path.join(entry,f));
 const extras={},written=new Set();
 for(const r of data.results){
  if(!hasArtifact(r)||!/^[A-Za-z0-9_-]+$/.test(r.id||''))continue;
  let payload;
  try{const buf=await fs.readFile(inside(pub,r.artifact));extras[r.id]={bytes:buf.length};payload=r.type==='model3d'?{glb:glbBase64(buf)}:r.type==='lp'?{html:buf.toString('utf8')}:{text:buf.toString('utf8')};}
  catch(e){payload={error:'成果物を読み込めません: '+e.message};}
  await fs.writeFile(path.join(assets,r.id+'.js'),`window.ENTRY_ASSETS[${script(r.id)}]=${script(payload)};\n`);written.add(r.id+'.js');
 }
 for(const n of await fs.readdir(assets))if(n.endsWith('.js')&&!written.has(n))await fs.rm(path.join(assets,n));
 const {labels,configs}=await modelLabels(data.results),links={};
 if(await exists(path.join(project,'README.md')))links.readme='README.md';
 const local={publicBase,models:labels,extras,links,compareUrl:publicBase+'index.html'};
 const html=(await fs.readFile(path.join(home,'entry','page.html'),'utf8')).replace('<!--ENTRY_LOCAL-->',()=>`<script>window.ENTRY_LOCAL=${script(local)};</script>`).replaceAll('__PUBLIC__',attr(publicBase));
 await fs.writeFile(path.join(project,'結果を見る.html'),html);
 return {assets:written.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const data=await readJson(path.join(repo,'results','public','manifest.json'));const {assets}=await navigation(repo,data);
 console.log(`結果を見る.html を作り直しました（成果データ ${assets}件）。モデルは実行していません。`);
}
