import {ORIGIN,parseCourses,identifyAccount,scanCourses} from './scan-engine.js';
import {safeURL} from './parser.js';
let active=null;
async function send(message){return chrome.runtime.sendMessage({target:'background',type:'job:update',...message});}
async function read(url,signal){
  if(!safeURL(url))throw Error('허용되지 않은 주소');
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal.aborted)abort();
  signal.addEventListener('abort',abort,{once:true});
  let timeout=false;
  const timer=setTimeout(()=>{timeout=true;controller.abort();},20000);
  try{
    const response=await fetch(url,{credentials:'include',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error(`서버 응답 ${response.status}`);
    if(!safeURL(response.url))throw Object.assign(Error('로그인이 필요합니다'),{code:'AUTH'});
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    if(doc.querySelector('input[type=password]'))throw Object.assign(Error('로그인이 필요합니다'),{code:'AUTH'});
    return doc;
  }catch(error){if(timeout&&!signal.aborted)throw Error('응답 시간 초과');throw error;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
async function run(request){
  const {runId,mode,previous={},selectedUrls=[]}=request,controller=new AbortController();
  active={runId,controller};
  const heartbeat=setInterval(()=>chrome.runtime.sendMessage({target:'background',type:'job:heartbeat',runId}).catch(()=>{}),15000);
  let base=previous,accountKey=null;
  try{
    const home=await read(ORIGIN+'/',controller.signal),courseList=parseCourses(home);
    if(!courseList.length)throw Error('나의강좌 목록을 찾지 못했습니다. 로그인 상태를 확인하세요.');
    const identity=identifyAccount(home);
    if(identity){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
      accountKey=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    }
    // Older snapshots have no fingerprint. Migrate them using only current enrolled courses.
    if(previous.accountKey&&previous.accountKey!==accountKey)base={items:[],warnings:[],checkedAt:null,accountKey};
    await send({runId,courseList,resetSnapshot:base!==previous?base:undefined,accountKey});
    if(mode==='courses'){
      await send({runId,done:true,job:{status:'complete',mode,message:`${courseList.length}개 강좌 · 선택 후 확인하세요.`,authExpired:false}});
      return;
    }
    const selected=courseList.filter(c=>selectedUrls.includes(c.url));
    if(!selected.length)throw Error('선택한 강좌를 찾지 못했습니다. 강좌를 다시 선택하세요.');
    const result=await scanCourses({selected,previous:base,accountKey,read:url=>read(url,controller.signal),signal:controller.signal,
      onUpdate:({snapshot,...job})=>send({runId,snapshot,job:{...job,status:'running',mode}})});
    if(request.automatic&&result.authExpired){
      await send({runId,snapshot:base,done:true,job:{status:'skipped',mode,message:'',authExpired:false}});return;
    }
    await send({runId,snapshot:result.snapshot,done:true,job:{...result,snapshot:undefined,status:result.stopped?'stopped':result.authExpired?'error':result.partial?'partial':'complete',mode}});
  }catch(error){
    if(request.automatic&&error.code==='AUTH'){
      await send({runId,snapshot:base,done:true,job:{status:'skipped',mode,message:'',authExpired:false}});return;
    }
    await send({runId,done:true,job:{status:error.name==='AbortError'?'stopped':'error',mode,authExpired:error.code==='AUTH',message:error.name==='AbortError'?'중지했습니다.':error.message}});
  }finally{clearInterval(heartbeat);active=null;}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.target!=='offscreen'||sender.id!==chrome.runtime.id)return;
  if(message.type==='job:status'){respond({running:!!active,runId:active?.runId});return;}
  if(message.type==='job:stop'){active?.controller.abort();respond({ok:true});return;}
  if(message.type==='job:start'){
    if(active){respond({ok:false,error:'이미 확인 중입니다'});return;}
    // run() sets active before its first await; acknowledge immediately.
    run(message).catch(()=>{});respond({ok:true});
  }
});
