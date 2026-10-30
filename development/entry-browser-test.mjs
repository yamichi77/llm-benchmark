// 「結果を見る.html」をfile://（ダブルクリックと同じ）で開いて確認する。手動実行: node development/entry-browser-test.mjs
// 1) 保存済みの実結果: JSエラーなし、3D描画、本文の整形、LPのsandbox。モデルは実行しない。
// 2) 敵対的LP: デモ成果の一時プロジェクトでLPを差し替え、外部通信と親ページ操作が止まり、フレーム自身の遷移を検知して静止表示へ切り替わることを確認する。
//    スクリプトによるフレーム自身の遷移はsandboxとCSPでは止められないため、遷移が確定した時点で検知する（遷移先への1回の要求は防げない）。
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';
import {demo} from './demo.mjs';import {navigation} from '../runtime/navigation.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(root),evidence=path.join(root,'private');
const local=u=>/^(file|data|blob|about):/.test(u);
async function open(browser,project,viewport={width:1440,height:900}){
 const page=await browser.newPage({viewport}),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!local(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(path.join(project,'結果を見る.html')).href);
 await page.waitForFunction(()=>[...document.querySelectorAll('.viewer')].every(v=>v.dataset.state!=='loading')&&![...document.querySelectorAll('.prose')].some(p=>p.textContent==='読み込み中…'),null,{timeout:60000});
 return {page,errors,external};
}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 {const {page,errors,external}=await open(browser,repo);await page.waitForTimeout(2500);
  const state=await page.evaluate(()=>({sections:document.querySelectorAll('main>section.sec').length,viewers:[...document.querySelectorAll('.viewer')].map(v=>[v.dataset.state,Number(v.dataset.triangles)]),sandboxes:[...document.querySelectorAll('iframe')].map(f=>f.getAttribute('sandbox')),prose:[...document.querySelectorAll('.prose')].map(p=>p.querySelectorAll('p').length),code:document.querySelectorAll('.prose code').length,errors:[...document.querySelectorAll('.error')].map(e=>e.textContent)}));
  const manifest=JSON.parse(await fs.readFile(path.join(repo,'results/public/manifest.json'),'utf8')),tasks=new Set(manifest.results.map(r=>r.task));
  assert.equal(state.sections,tasks.size);assert.deepEqual(state.errors,[]);
  assert.ok(state.viewers.length&&state.viewers.every(([s,t])=>s==='ready'&&t>0),'3D rendered: '+JSON.stringify(state.viewers));
  assert.ok(state.sandboxes.length>=2&&state.sandboxes.every(s=>s==='allow-scripts'),'LP sandbox');
  assert.ok(state.prose.every(n=>n>0)&&state.code>0,'text formatted');
  for(const f of page.frames().slice(1))assert.equal(await f.evaluate(()=>{try{return !!parent.document.body;}catch{return false;}}),false,'LP isolated from parent');
  for(const [i,id] of ['overview',...await page.evaluate(()=>[...document.querySelectorAll('main>section.sec')].map(s=>s.id))].entries()){await page.evaluate(id=>{document.documentElement.style.scrollBehavior='auto';const s=document.getElementById(id);window.scrollTo(0,id==='overview'?0:s.offsetTop-96);},id);await page.waitForTimeout(600);await page.screenshot({path:path.join(evidence,`entry-ui-${i}.png`)});}
  await page.locator('.vv[data-view="side"]').click();await page.locator('.ref .btn',{hasText:'並べて表示'}).click();await page.waitForTimeout(800);await page.locator('.m3d-grid').screenshot({path:path.join(evidence,'entry-ui-3d-compare.png')});
  await page.locator('.seg button',{hasText:'原文テキスト'}).first().click();assert.equal(await page.locator('.raw').first().isVisible(),true);
  const narrow=await open(browser,repo,{width:390,height:844});await narrow.page.screenshot({path:path.join(evidence,'entry-ui-390.png')});
  assert.equal(await narrow.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no horizontal scroll at 390px');
  assert.deepEqual([...errors,...narrow.errors],[]);assert.deepEqual([...external,...narrow.external],[]);await narrow.page.close();await page.close();
  console.log('Entry PASS: file:// で4課題表示、3D描画、本文整形、LP sandbox、JSエラー・外部通信なし',JSON.stringify(state.viewers));}
 {const project=await fs.mkdtemp(path.join(evidence,'test-runs','entry-hostile-')),results=path.join(project,'results');await demo(results);
  const data=JSON.parse(await fs.readFile(path.join(results,'public','manifest.json'),'utf8')),lps=data.results.filter(r=>r.type==='lp');
  const hostile=html=>Promise.all(lps.map(r=>fs.writeFile(path.join(results,'public',r.artifact),html)));
  await hostile('<h1 id="x">hostile</h1><script>try{parent.document.body.innerHTML="BAD"}catch(e){}fetch("https://example.invalid/fetch").catch(()=>{});new Image().src="https://example.invalid/img";</script><img src="https://example.invalid/tag"><style>@import url(https://example.invalid/style);</style><link rel="stylesheet" href="https://example.invalid/link"><a href="https://example.invalid/a">a</a><iframe src="https://example.invalid/frame"></iframe><form action="https://example.invalid/form"><button>go</button></form><meta http-equiv="refresh" content="0;url=https://example.invalid/refresh">');
  await navigation(project,data,results);
  const {page,external}=await open(browser,project);await page.waitForTimeout(1500);
  assert.deepEqual(external,[],'no external requests');assert.match(await page.locator('h1').first().textContent(),/^fake-[ab] の成果$/);assert.ok(page.frames().length>1,'LP frames mounted');
  for(const f of page.frames().slice(1))assert.equal(await f.locator('a').first().getAttribute('href').catch(()=>null),null);
  await hostile('<h1>nav</h1><script>setTimeout(()=>{location.href="about:blank"},300)</script>');
  await navigation(project,data,results);await page.reload();await page.waitForTimeout(2500);
  assert.equal(await page.locator('.note.bad',{hasText:'静止表示に切り替えました'}).first().isVisible(),true,'navigation detected');
  assert.ok(await page.locator('iframe').evaluateAll(fs=>fs.every(f=>f.getAttribute('sandbox')==='')),'switched to static');
  await page.close();console.log('Hostile LP PASS: 外部通信なし、親ページ不可侵、リンク無効、フレーム遷移を検知して静止表示へ切替');}
}finally{await browser.close();}
