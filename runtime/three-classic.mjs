import fs from 'node:fs/promises';import path from 'node:path';
// file://で開いた結果ページはES moduleを読めないため、three.jsとGLB表示に要るアドオンをクラシックスクリプト1本にまとめる。
const addon=(src,deps)=>{const body=src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm,(_,names,from)=>{if(!(from in deps))throw Error('Unexpected import '+from);return 'const {'+names.replace(/\s+as\s+/g,':')+'}='+deps[from]+';';}).replace(/^export\s*\{([^}]*)\};?[ \t]*$/m,'return {$1};');if(/^(import|export)\b/m.test(body))throw Error('Unsupported module syntax');return '(function(){\'use strict\';\n'+body+'\n})()';};
export async function threeClassic(three){
 const read=p=>fs.readFile(path.join(three,p),'utf8'),pkg=JSON.parse(await read('package.json'));
 const core=await read('build/three.cjs');if(/\brequire\s*\(/.test(core))throw Error('three.cjs must not require modules');
 const utils=addon(await read('examples/jsm/utils/BufferGeometryUtils.js'),{three:'THREE'}),gltf=addon(await read('examples/jsm/loaders/GLTFLoader.js'),{three:'THREE','../utils/BufferGeometryUtils.js':'UTILS'}),orbit=addon(await read('examples/jsm/controls/OrbitControls.js'),{three:'THREE'});
 const license=(await read('LICENSE')).trim().replaceAll('*/','* /');
 return `/* three.js ${pkg.version} + GLTFLoader + OrbitControls（runtime/three-classic.mjs で生成）\n${license}\n*/\n(function(){'use strict';\nconst THREE=(function(){const exports={};\n${core}\nreturn exports;})();\nconst UTILS=${utils};\nconst {GLTFLoader}=${gltf};\nconst {OrbitControls}=${orbit};\nwindow.BENCHMARK_3D={THREE,GLTFLoader,OrbitControls};\n})();\n`;
}
