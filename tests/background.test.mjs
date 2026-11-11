import assert from 'node:assert/strict';
import {DOMParser} from 'linkedom';
globalThis.DOMParser=DOMParser;
let readerWarmup=2;
const listeners=[],data={courseList:[{name:'테스트 강좌',category:'교과',url:'https://eclass.dongguk.edu/course/view.php?id=1'}]};
const clone=value=>structuredClone(value);
let readerExists=false,failVideo=false,title='새 과제',delay=15,auth=false,student='9999000001';
const runtime={id:'test-extension',getURL:path=>`chrome-extension://test-extension/${path}`,
  onInstalled:{addListener(){}},onStartup:{addListener(){}},
  async getContexts(){return readerExists?[{contextType:'OFFSCREEN_DOCUMENT'}]:[];},
  onMessage:{addListener(fn){listeners.push(fn);}},
  sendMessage(message){if(message.target==='offscreen'&&message.type==='job:status'&&readerWarmup-->0)return Promise.reject(Error('Receiving end does not exist'));return new Promise((resolve,reject)=>{
    let handled=false;
    const timer=setTimeout(()=>reject(Error(`No response: ${message.type}`)),2000);
    const respond=result=>{clearTimeout(timer);resolve(clone(result));};
    for(const fn of listeners){const result=fn(message,{id:runtime.id},respond);if(result===true)handled=true;}
    // Listeners may respond synchronously without returning true.
  });}
};
globalThis.chrome={runtime,alarms:{async get(){return null;},async create(){},async clear(){},onAlarm:{addListener(){}}},storage:{onChanged:{addListener(){}},local:{
  async get(keys){return Object.fromEntries([].concat(keys).map(k=>[k,clone(data[k])]));},
  async set(value){Object.assign(data,clone(value));}
}},offscreen:{async createDocument(options){assert.deepEqual(options.reasons,['DOM_PARSER']);readerExists=true;await import('../extension/offscreen.js');}}};
const base='https://eclass.dongguk.edu';
const future='2099/11/16 23:59';
function html(url){
  if(url===base+'/')return auth?'<input type="password">':`<button>테스트 (${student})</button><a class="course-link" href="${base}/course/view.php?id=1"><div class="course-label">교과</div><h3>테스트 강좌</h3></a>`;
  if(url.includes('/course/view.php'))return `<a href="${base}/mod/assign/index.php?id=1">과제</a><a href="${base}/local/ubattendance/attendance_book.php?id=1">출석부</a><li class="activity modtype_vod"><div class="activityinstance"><a href="${base}/mod/vod/view.php?id=9"><span class="instancename">테스트 영상</span></a></div><span class="displayoptions">2020-01-01 00:00:00 ~ 2099-11-16 23:59:59</span></li>`;
  if(url.includes('/mod/assign/index.php'))return `<table><thead><tr><th>제목</th><th>종료 일시</th><th>제출</th></tr></thead><tbody><tr><td><a href="${base}/mod/assign/view.php?id=8">${title}</a></td><td>${future}</td><td>미제출</td></tr></tbody></table>`;
  if(url.includes('/local/ubattendance/'))return `<a href="${base}/report/ubcompletion/progress.php?id=1">동영상 출석부</a>`;
  if(url.includes('/report/ubcompletion/')){if(failVideo)throw Error('출석부 일시 오류');return '<table class="user_progress_table"><thead><tr><th>출석인정 요구시간</th></tr></thead><tbody><tr><td><img src="/theme/vod/icon">테스트 영상</td><td>20:00</td><td>08:00</td><td>X</td></tr></tbody></table>';}
  throw Error(`Unexpected read: ${url}`);
}
globalThis.fetch=async(url,{signal})=>{
  await new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const timer=setTimeout(resolve,delay);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});
  });
  const content=html(url);return {ok:true,url,text:async()=>content};
};
await import('../extension/background.js');
const send=message=>runtime.sendMessage({target:'background',...message});
const selectedUrls=[data.courseList[0].url];
assert.equal((await send({type:'job:start',mode:'courses'})).ok,true);
await finished();
assert.equal(data.job.status,'complete');
assert.equal(data.courseList[0].name,'테스트 강좌');
data.snapshot={items:[{kind:'과제',title:'이전 과제',course:'테스트 강좌',state:'pending'}],checkedAt:1};
assert.equal((await send({type:'job:start',mode:'scan',selectedUrls})).ok,true);
assert.equal(data.snapshot.items[0].title,'이전 과제','Do not blank previous results at scan start');
assert.equal(data.snapshot.items[0].stale,true);
assert.equal((await send({type:'job:start',mode:'scan',selectedUrls})).ok,false,'Reject duplicate scan');
async function finished(){
  const deadline=Date.now()+3000;
  while(data.job.status==='running'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
  assert.notEqual(data.job.status,'running','Job must finish without an open popup');
  await new Promise(r=>setTimeout(r,5));
}
await finished();
assert.equal(data.job.status,'complete');assert.equal(data.snapshot.items.length,2);
assert.equal(data.snapshot.items.find(i=>i.kind==='과제').title,'새 과제');
assert.equal(data.snapshot.items.find(i=>i.kind==='동영상').learnedSeconds,480);
await send({type:'job:sync'});assert.equal(data.job.status,'complete','Reopen retains completion');
title='수정된 과제';failVideo=true;
await send({type:'job:start',mode:'scan',selectedUrls});await finished();
assert.equal(data.job.status,'partial');
assert.equal(data.snapshot.items.find(i=>i.kind==='과제').title,'수정된 과제');
assert.equal(data.snapshot.items.find(i=>i.kind==='동영상').stale,true,'Failed scope retains previous result');
assert.equal(data.snapshot.items.find(i=>i.kind==='과제').stale,false);
delay=100;await send({type:'job:start',mode:'scan',selectedUrls});await send({type:'job:stop'});await finished();
assert.equal(data.job.status,'stopped');assert.equal(data.snapshot.items.length,2,'Cancel preserves results');
failVideo=false;delay=1;await send({type:'job:start',mode:'scan',selectedUrls});await finished();
assert.ok(data.snapshot.items.every(i=>!i.stale));const lastFullSuccess=data.snapshot.fullyCheckedAt;
auth=true;delay=1;await send({type:'job:start',mode:'scan',selectedUrls});await finished();
assert.equal(data.job.status,'error');assert.equal(data.job.authExpired,true);assert.ok(data.snapshot.items.every(i=>i.stale));assert.equal(data.snapshot.fullyCheckedAt,lastFullSuccess);assert.equal(data.snapshot.items.length,2);
const beforeSilentSkip=clone(data.snapshot);
await send({type:'job:start',mode:'scan',selectedUrls,automatic:true});await finished();
assert.equal(data.job.status,'skipped');assert.equal(data.job.message,'');assert.equal(data.job.authExpired,false);assert.deepEqual(data.snapshot,beforeSilentSkip,'Automatic login expiry must not change cached cards or show an error');
auth=false;await send({type:'job:start',mode:'scan',selectedUrls,automatic:true});await finished();
assert.equal(data.job.status,'complete');assert.ok(data.snapshot.items.every(i=>!i.stale),'Automatic retry after login restores fresh results without manual refresh');
auth=false;failVideo=true;student='9999000002';await send({type:'job:start',mode:'scan',selectedUrls});await finished();
assert.equal(data.snapshot.items.length,1,'Another account must not inherit the old video results');
assert.equal(data.snapshot.items[0].kind,'과제');
console.log('PASS: real broker/offscreen modules with mock Chrome + HTML; popup-independent completion, duplicate prevention, partial merge, reopen, cancellation');
