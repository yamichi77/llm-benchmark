import fs from 'node:fs/promises';
export async function packGltf(text,destination){
 const doc=JSON.parse(text);if(doc.asset?.version!=='2.0'||!doc.meshes?.length)throw Error('Expected glTF 2.0 meshes');
 const bins=[];let size=0;for(const b of doc.buffers||[]){if(!/^data:application\/(octet-stream|gltf-buffer);base64,/.test(b.uri||''))throw Error('Only embedded base64 buffers accepted');const bin=Buffer.from(b.uri.split(',')[1],'base64');if(bin.length!==b.byteLength)throw Error('Buffer byteLength mismatch');bins.push({offset:size,bin});size+=Math.ceil(bin.length/4)*4;}
 for(const view of doc.bufferViews||[]){const b=bins[view.buffer];if(!b)throw Error('Missing buffer');view.byteOffset=(view.byteOffset||0)+b.offset;view.buffer=0;}
 for(const image of doc.images||[]){if(image.uri&&!image.uri.startsWith('data:'))throw Error('External image rejected');}
 const binary=Buffer.alloc(size);for(const b of bins)b.bin.copy(binary,b.offset);doc.buffers=[{byteLength:size}];
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length,0);bh.writeUInt32LE(0x004e4942,4);await fs.writeFile(destination,Buffer.concat([header,json,bh,binary]));
}
