// 生成LPをsandbox iframeで表示する。allow-same-originを付けないため親ページやローカルファイルには触れられず、CSPで外部通信も止める。
// 「静止」はスクリプトとイベント属性を除去した静的表示。「動きあり」はsandbox内でインラインスクリプトだけを実行する。
window.LPFrame={
 csp(animated){return "default-src 'none'; script-src "+(animated?"'unsafe-inline'":"'none'")+"; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";},
 document(html,animated){
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('iframe,frame,object,embed,portal,base,meta[http-equiv],link'+(animated?',script[src]':',script')).forEach(e=>e.remove());
  doc.querySelectorAll('a,area').forEach(e=>{if(!(e.getAttribute('href')||'').startsWith('#'))e.removeAttribute('href');e.removeAttribute('target');});
  doc.querySelectorAll('form').forEach(e=>{e.removeAttribute('action');e.removeAttribute('target');});
  if(!animated)doc.querySelectorAll('*').forEach(e=>{for(const a of [...e.attributes])if(a.name.startsWith('on'))e.removeAttribute(a.name);});
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="'+this.csp(animated)+'">'+doc.documentElement.outerHTML;
 },
 // スクリプトによるフレーム自身の遷移はsandboxとCSPでは止められない。2回目のloadで遷移を検知し、呼び出し側が静止表示へ切り替える。
 create(html,animated,title,onNavigate){const f=document.createElement('iframe');f.title=title;f.setAttribute('sandbox',animated?'allow-scripts':'');f.referrerPolicy='no-referrer';let loads=0;f.addEventListener('load',()=>{if(++loads>1){f.remove();onNavigate?.();}});f.srcdoc=this.document(html,animated);return f;}
};
// 成果データ（results/public/entry/assets/*.js）はfile://でも読めるクラシックスクリプトで渡す。
window.ENTRY_ASSETS=window.ENTRY_ASSETS||{};
window.loadEntryAsset=function(base,id){
 if(!/^[A-Za-z0-9_-]+$/.test(id))return Promise.reject(Error('不正な成果IDです'));
 if(window.ENTRY_ASSETS[id])return Promise.resolve(window.ENTRY_ASSETS[id]);
 return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=base+'entry/assets/'+id+'.js';s.onload=()=>window.ENTRY_ASSETS[id]?resolve(window.ENTRY_ASSETS[id]):reject(Error('成果データが空です'));s.onerror=()=>reject(Error('成果データを読み込めません。npm run entry で作り直してください'));document.head.append(s);});
};
