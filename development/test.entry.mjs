import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {demo} from './demo.mjs';import {navigation} from '../runtime/navigation.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),generated=path.join(root,'private','test-runs');await fs.mkdir(generated,{recursive:true});
const load=(code,ctx={})=>{const c=vm.createContext({window:{ENTRY_ASSETS:{}},console,TextDecoder,AbortController,...ctx});vm.runInContext(code,c);return c;};
test('double-click entry: classic scripts for text, LP, GLB and three.js',async()=>{
 const project=await fs.mkdtemp(generated+'/test-entry-'),results=path.join(project,'results');await demo(results);
 const data=JSON.parse(await fs.readFile(path.join(results,'public','manifest.json'),'utf8')),pub=path.join(results,'public'),assets=path.join(pub,'entry','assets');
 await fs.mkdir(assets,{recursive:true});await fs.writeFile(path.join(assets,'stale.js'),'');
 const model3d=data.results.find(r=>r.type==='model3d'),bad={...model3d,id:'external-glb',artifact:model3d.trialPath+'/external.glb'};
 const j=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'https://example.invalid/x.bin',byteLength:4}]})),glb=Buffer.alloc(20+j.length);glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(j.length,12);glb.writeUInt32LE(0x4e4f534a,16);j.copy(glb,20);await fs.writeFile(path.join(pub,bad.artifact),glb);
 const escape={...data.results.find(r=>r.type==='writing'),id:'escape',artifact:'../../package.json'};
 const {assets:count}=await navigation(project,{...data,results:[...data.results,bad,escape]},results);
 assert.equal(count,data.results.length+2);
 const names=await fs.readdir(assets);assert.ok(!names.includes('stale.js'),'stale assets removed');
 const html=await fs.readFile(path.join(project,'結果を見る.html'),'utf8');
 assert.ok(html.includes('<script src="results/public/manifest.js"></script>'));assert.ok(html.includes('src="results/public/entry/lp-frame.js"'));assert.ok(!/type="module"|importmap|fetch\(/.test(html),'no module/fetch for file://');
 const local=load(html.match(/<script>(window\.ENTRY_LOCAL=[^\n]*?);<\/script>/)[1]).window.ENTRY_LOCAL;assert.equal(local.publicBase,'results/public/');assert.ok(!JSON.stringify(local).includes(project),'no absolute paths');
 const asset=async r=>load(await fs.readFile(path.join(assets,r.id+'.js'),'utf8')).window.ENTRY_ASSETS[r.id];
 for(const r of data.results){const a=await asset(r),raw=await fs.readFile(path.join(pub,r.artifact));if(r.type==='lp')assert.equal(a.html,raw.toString('utf8'));else if(r.type==='model3d')assert.equal(a.glb,raw.toString('base64'));else assert.equal(a.text,raw.toString('utf8'));}
 assert.match((await asset(bad)).error,/外部ファイル/);assert.match((await asset(escape)).error,/escapes/);
 const frame=(await fs.readFile(path.join(pub,'entry','lp-frame.js'),'utf8')).replace(/^\s*\/\/.*$/gm,'');assert.ok(frame.includes("connect-src 'none'")&&frame.includes("setAttribute('sandbox',animated?'allow-scripts':'')")&&!frame.includes('allow-same-origin'));
 const three=load(await fs.readFile(path.join(pub,'entry','three.js'),'utf8')),{THREE,GLTFLoader,OrbitControls}=three.window.BENCHMARK_3D;
 assert.equal(THREE.REVISION,'180');assert.equal(typeof OrbitControls,'function');
 const bin=Buffer.from((await asset(model3d)).glb,'base64');three.bytes=new Uint8Array(bin);const buffer=vm.runInContext('new Uint8Array(bytes).buffer',three);
 const gltf=await new GLTFLoader().parseAsync(buffer,'');let meshes=0;gltf.scene.traverse(o=>{if(o.isMesh)meshes++;});assert.equal(meshes,1);
});
