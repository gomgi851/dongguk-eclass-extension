let creating=null,starting=null,writes=Promise.resolve();
const offscreenURL=chrome.runtime.getURL('offscreen.html');
async function contexts(){return chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[offscreenURL]});}
async function ensureReader(){
  if(!(await contexts()).length){
    if(!creating)creating=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['DOM_PARSER'],justification:'로그인된 e-Class 목록과 출석부를 팝업을 닫은 뒤에도 읽습니다.'}).finally(()=>creating=null);
    await creating;
  }
  // The document can exist while its module graph is still starting.
  for(let attempt=0;attempt<20;attempt++){
    const state=await chrome.runtime.sendMessage({target:'offscreen',type:'job:status'}).catch(()=>null);
    if(state&&typeof state.running==='boolean')return state;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('수집 기능을 준비하지 못했습니다. 확장프로그램을 새로고침한 뒤 다시 시도하세요.');
}
function enqueue(fn){const task=writes.then(fn);writes=task.catch(()=>{});return task;}
async function reconcile(){
  if(starting)return;
  const {job}=await chrome.storage.local.get('job');
  if(job?.status!=='running')return;
  const exists=(await contexts()).length;
  const status=exists?await chrome.runtime.sendMessage({target:'offscreen',type:'job:status'}).catch(()=>null):null;
  if(!status?.running||status.runId!==job.runId)await chrome.storage.local.set({job:{...job,status:'interrupted',message:'확인이 중단되었습니다. 다시 새로고침하세요.'}});
}
async function start(message){
  const state=await ensureReader();
  if(state.running)return {ok:false,error:'이미 확인 중입니다'};
  const {snapshot,courseList=[],selectedUrls}=await chrome.storage.local.get(['snapshot','courseList','selectedUrls']);
  const requested=Array.isArray(message.selectedUrls)?message.selectedUrls:Array.isArray(selectedUrls)?selectedUrls:courseList.filter(c=>c.category==='교과').map(c=>c.url);
  if(message.mode==='scan'&&!requested.length)return {ok:false,error:'강좌를 하나 이상 선택하세요.'};
  const runId=crypto.randomUUID();
  const job={runId,status:'running',mode:message.mode,startedAt:Date.now(),updatedAt:Date.now(),completed:0,total:requested.length,message:message.mode==='courses'?'강좌 목록 확인 중…':'로그인 상태 확인 중…'};
  const update={job};
  if(message.mode==='scan'&&snapshot)update.snapshot={...snapshot,items:(snapshot.items||[]).map(item=>({...item,checkedAt:item.checkedAt||snapshot.checkedAt||null,stale:true}))};
  await chrome.storage.local.set(update);
  try{
    const result=await chrome.runtime.sendMessage({target:'offscreen',type:'job:start',runId,mode:message.mode,selectedUrls:requested,previous:snapshot||{}});
    if(!result?.ok)throw Error(result?.error||'확인을 시작하지 못했습니다.');
    return {ok:true};
  }catch(error){await chrome.storage.local.set({job:{...job,status:'error',message:error.message}});return {ok:false,error:error.message};}
}
async function handle(message){
  if(message.type==='job:start'){
    if(starting)return {ok:false,error:'이미 확인을 시작하는 중입니다'};
    starting=start(message).finally(()=>starting=null);return starting;
  }
  if(message.type==='job:stop'){
    if((await contexts()).length)await chrome.runtime.sendMessage({target:'offscreen',type:'job:stop'});
    return {ok:true};
  }
  if(message.type==='job:sync'){await enqueue(reconcile);return {ok:true};}
  if(message.type==='job:update'||message.type==='job:heartbeat')return enqueue(async()=>{
    const {job}=await chrome.storage.local.get('job');
    if(job?.runId!==message.runId||job.status!=='running')return {ok:false};
    const update={job:{...job,...message.job,updatedAt:Date.now()}};
    if(message.courseList)update.courseList=message.courseList;
    if(message.resetSnapshot)update.snapshot=message.resetSnapshot;
    if(message.snapshot)update.snapshot=message.snapshot;
    await chrome.storage.local.set(update);
    return {ok:true};
  });
  return {ok:false,error:'지원하지 않는 요청'};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.target!=='background'||sender.id!==chrome.runtime.id)return;
  handle(message).then(respond,error=>respond({ok:false,error:error.message}));
  return true;
});
