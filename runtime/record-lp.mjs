import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node record-lp.mjs INPUT.html NEW_OUTPUT_DIR');
const html=await fs.readFile(path.resolve(input),'utf8');
const out=path.resolve(output);
await fs.mkdir(out); // Existing recordings must not be overwritten.
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
const reports=[];
function encode(args){return new Promise((resolve,reject)=>{const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let error='';p.stderr.on('data',c=>error+=c);p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(error)));});}
try{
 for(const [name,width,height] of [['pc',1024,768],['mobile',390,844]]){
  const frames=path.join(out,name+'-frames');await fs.mkdir(frames);
  const context=await browser.newContext({viewport:{width,height},offline:true,serviceWorkers:'block',acceptDownloads:false,permissions:[]});
  let blocked=0;await context.route('**/*',route=>{blocked++;return route.abort();});
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(()=>{Object.defineProperty(globalThis,'RTCPeerConnection',{value:undefined});Object.defineProperty(globalThis,'webkitRTCPeerConnection',{value:undefined});});
  const page=await context.newPage();context.on('page',other=>{if(other!==page)other.close().catch(()=>{});});page.on('download',d=>d.cancel());
  // Fresh browser context; no logged-in profile. The original HTML file is never changed.
  await page.setContent(html,{waitUntil:'domcontentloaded'});
  const start=Date.now();
  for(let i=0;i<60;i++){
   if(i===30)await page.evaluate(()=>window.scrollTo({top:innerHeight*.8,behavior:'smooth'}));
   await page.screenshot({path:path.join(frames,String(i).padStart(3,'0')+'.png')});
   if(i===10)await fs.copyFile(path.join(frames,'010.png'),path.join(out,name+'.png'));
   const delay=start+(i+1)*100-Date.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));
  }
  reports.push({name,width,height,frames:60,blockedRequests:blocked});await context.close();
  await encode(['-hide_banner','-loglevel','error','-framerate','10','-i',path.join(frames,'%03d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,name+'.mp4')]);
 }
 await fs.writeFile(path.join(out,'recording.json'),JSON.stringify({source:path.resolve(input),sourceUnmodified:true,offline:true,networkRoutes:'abort-all',reports},null,2));
 console.log(JSON.stringify(reports));
}finally{await browser.close();}
