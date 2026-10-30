import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {preparation} from '../runtime/cursor-grok-prepare.mjs';
const config=JSON.parse(await fs.readFile(new URL('../runtime/benchmarks/v2/config-grok-preparation.json',import.meta.url),'utf8'));
test('preparation cannot advertise an executable model or enable Fast',()=>{
  const info=preparation(config);
  assert.equal(info.ready,false);assert.deepEqual(info.data,[]);assert.equal(info.modelInferenceRequests,0);
  assert.equal(info.verifiedExecutableModel,null);assert.equal(info.speed,'standard');
  assert.equal(info.verifiedCatalogModel,'grok-4.7-high');assert.equal(info.intendedEffort,'high');
  assert.match(info.blockers[0],/filesystem isolation unavailable/);
  assert.throws(()=>preparation({...config,speed:'fast'}));
  assert.throws(()=>preparation({...config,models:[{modelId:'unverified'}]}));
});
test('fixed inputs preserved and 3D held',()=>{
  assert.equal(config.tasks.length,4);
  assert.equal(config.tasks.find(t=>t.type==='model3d').executionHold,true);
  assert.equal(config.tasks.find(t=>t.type==='research').inputVersion,'b3a3d3568846d1b154e891fc4683c1eea73263ee');
});
