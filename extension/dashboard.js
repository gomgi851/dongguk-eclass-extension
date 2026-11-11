import {ORIGIN,safeURL,phase} from './parser.js';
import {visibleItems,deadlineRemaining} from './filters.js';
const $ = id=>document.getElementById(id);
let courseList=[], items=[], warnings=[], checkedAt=null, fullyCheckedAt=null, busy=false, job=null;
let kind='과제', submission='pending', selectedUrls=null;
const labels={pending:'남음',upcoming:'공개 예정',unknown:'확인 필요',expired:'기한 지남',done:'완료·인정'};
function node(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
function openSettings(){
  $('settings').open=true;
  if(!$('settings-dialog').open)$('settings-dialog').showModal();
}
$('settings-button').addEventListener('click',openSettings);
$('close-settings').addEventListener('click',()=>$('settings-dialog').close());
$('theme').addEventListener('change',()=>{const theme=$('theme').checked?'dark':'light';document.documentElement.dataset.theme=theme;chrome.storage.local.set({theme});});
async function checkFont(){
  try{
    const faces=await document.fonts.load('400 18px "eClass Jalnan"','가나다ABC');
    $('font-status').textContent=faces.length&&faces.every(f=>f.status==='loaded')?'글꼴 · 여기어때 잘난체 2':'글꼴 · 기본 글꼴 (잘난체 로드 실패)';
  }catch{$('font-status').textContent='글꼴 · 기본 글꼴 (잘난체 로드 실패)';}
}
checkFont();
$('all-weeks').addEventListener('change',()=>chrome.storage.local.set({allWeeks:$('all-weeks').checked}));
function date(n){return n?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(n):'기한 미확인';}
function remaining(n){return deadlineRemaining(n);}
function setBusy(value){busy=value;$('load').disabled=value;$('scan').disabled=value||!courseList.length;$('refresh').disabled=value;$('stop').disabled=!value;$('clear').disabled=value;document.querySelectorAll('#courses input').forEach(e=>e.disabled=value);}
function showStatus(message,isError=false){
  for(const id of ['status','settings-status']){$(id).textContent=message;$(id).classList.toggle('status-error',isError);}
}
async function requestJob(message){
  let timer;
  try{return await Promise.race([chrome.runtime.sendMessage({target:'background',...message}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('확장프로그램 응답이 없습니다. chrome://extensions에서 Dongguk e-Class를 새로고침한 뒤 다시 열어주세요.')),12000);})]);}
  finally{clearTimeout(timer);}
}
function renderJob(){
  setBusy(job?.status==='running');
  $('scan-progress').hidden=!busy;
  $('scan-progress').max=Math.max(1,job?.total||1);
  $('scan-progress').value=job?.completed||0;
  $('login-link').hidden=!job?.authExpired;
  $('settings-login').hidden=!job?.authExpired;
  const message=job?.message||'';
  showStatus(busy?message:job?.status==='complete'&&job.mode==='scan'?'':message,['partial','error','interrupted'].includes(job?.status));
}
function render(){
  syncPeriod();
  const isTask=kind==='과제';
  document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
  document.querySelectorAll('[data-submission]').forEach(b=>{
    const mode=b.dataset.submission;
    b.setAttribute('aria-pressed',String(mode===submission));
    b.querySelector('.label').textContent=mode==='all'?'전체':mode==='done'?(isTask?'제출함':'수강함'):(isTask?'미제출':'미수강');
    b.querySelector('.count').textContent=visibleItems(items,{kind,submission:mode,period:$('filter').value}).length;
  });
  $('summary').textContent=checkedAt?`${date(checkedAt)} 확인`:'';
  $('summary').title=fullyCheckedAt?`마지막 전체 확인: ${date(fullyCheckedAt)}`:'전체 확인이 완료된 기록이 없습니다.';
  const unknown=items.filter(i=>i.kind===kind&&phase(i)==='unknown').length;
  $('attention').hidden=!unknown;
  $('attention').textContent=`확인 필요 ${unknown}건 · 직접 확인 ›`;
  $('warnings').textContent=warnings.join('\n');
  $('warning-details').hidden=!warnings.length;
  $('settings-dot').hidden=!warnings.length;
  $('settings-button').title=warnings.length?`설정 · 확인 안내 ${warnings.length}건`:'설정';
  $('warning-count').textContent=`확인 안내 ${warnings.length}건`;
  const list=visibleItems(items,{kind,submission,period:$('filter').value});
  $('results').replaceChildren();
  if(!list.length){$('results').append(node('p',busy?'확인 중입니다. 잠시만 기다려 주세요.':items.length?'이 필터에 해당하는 항목이 없습니다.':warnings.length?'확인하지 못한 강좌가 있습니다. 설정의 안내를 확인하세요.':checkedAt?'확인된 항목이 없습니다.':courseList.length?'선택한 강좌를 확인해 주세요.':'강좌 설정에서 시작하세요.','note'));return;}
  for(const item of list){
    const row=node('article','','item'), a=node('a',item.title),meta=node('div','','item-meta'),top=node('div','','item-top');
    a.href=safeURL(item.url)||ORIGIN;a.target='_blank';a.rel='noopener';
    a.title=kind==='과제'?'과제 열기 · 수정 가능 여부는 강의실에서 확인':item.title;
    const state=phase(item);
    const label=state==='done'?(isTask?'제출함':item.state==='late'?'지각 인정':'수강함'):state==='pending'?(isTask?'미제출':'미수강'):labels[state];
    const badge=node('span',item.unsupported?'미지원 형식':label,`badge ${state}`);badge.title=item.evidence;
    top.append(node('span',item.course.replace(/\s*[-–]\s*\d+분반.*$/,'').replace(/\s*\(\d학기\)/,''),'course'));
    if(state!=='done'&&state!=='unknown')top.append(node('span',state==='upcoming'?'공개 예정':remaining(item.due),`countdown ${state==='expired'?'expired':''}`));
    meta.append(node('span',state==='upcoming'?`${date(item.start)} 공개`:`${date(item.due)}${item.due?' 마감':''}`,'deadline'),badge);
    row.append(top,a,meta);
    if(item.unsupported)row.append(node('div','출석 자동 확인 불가 · 학교에서 직접 확인','unsupported-note'));
    if(item.kind==='동영상'&&state!=='done'&&item.requiredSeconds>0&&Number.isFinite(item.learnedSeconds)){
      const left=Math.max(0,item.requiredSeconds-item.learnedSeconds);
      const learning=node('div',left>0?`요구시간까지 약 ${Math.ceil(left/60)}분`:'요구시간 도달 · 출석 확인 필요','learning');
      const bar=document.createElement('progress');bar.max=item.requiredSeconds;bar.value=Math.min(item.learnedSeconds,item.requiredSeconds);bar.setAttribute('aria-label','학습시간 진행률');learning.append(bar);row.append(learning);
    }
    if(item.stale){
      const previous=item.state==='done'?(isTask?'제출함':'수강함'):item.state==='late'?'지각 인정':item.state==='pending'?(isTask?'미제출':'미수강'):'확인 필요';
      row.classList.add('stale');row.append(node('div',`갱신 필요 · 이전 ${previous} · ${date(item.checkedAt)}`,'stale-note'));
    }

    $('results').append(row);
  }
}
function renderCourses(){
  $('courses').replaceChildren();
  for(const [index,c] of courseList.entries()){
    const label=node('label',''),input=document.createElement('input');input.type='checkbox';input.value=index;
    input.checked=selectedUrls?selectedUrls.includes(c.url):c.category==='교과';
    input.disabled=busy;
    input.addEventListener('change',()=>{selectedUrls=[...document.querySelectorAll('#courses input:checked')].map(e=>courseList[Number(e.value)].url);chrome.storage.local.set({selectedUrls});});
    label.append(input,node('span',c.name));$('courses').append(label);
  }
}
async function startJob(mode){
  const selected=[...document.querySelectorAll('#courses input:checked')].map(e=>courseList[Number(e.value)].url);
  if(mode==='scan'&&!selected.length){$('status').textContent='강좌를 하나 이상 선택하세요.';openSettings();return;}
  setBusy(true);
  showStatus(mode==='courses'?'강좌 목록을 불러오는 중…':'학습 목록 확인을 시작하는 중…');
  try{
    const result=await requestJob({type:'job:start',mode,selectedUrls:selected});
    if(!result?.ok)throw Error(result?.error||'확인을 시작하지 못했습니다.');
    applyData(await chrome.storage.local.get(['snapshot','job','courseList','selectedUrls']));
    if(mode==='courses')openSettings();
  }catch(error){setBusy(false);showStatus(error.message,true);}
}
$('load').addEventListener('click',()=>startJob('courses'));
$('scan').addEventListener('click',()=>startJob('scan'));
$('refresh').addEventListener('click',()=>startJob(courseList.length?'scan':'courses'));
$('stop').addEventListener('click',async()=>{try{await chrome.runtime.sendMessage({target:'background',type:'job:stop'});}catch(error){$('status').textContent=error.message;}});
$('clear').addEventListener('click',async()=>{
  if(busy)return;
  await chrome.storage.local.remove(['snapshot','job','courseList','selectedUrls','scanIncomplete']);
  items=[];warnings=[];checkedAt=null;fullyCheckedAt=null;courseList=[];selectedUrls=null;job=null;
  renderCourses();renderJob();openSettings();$('status').textContent='강좌를 불러오세요.';render();
});
function rememberView(){chrome.storage.local.set({view:{kind,submission,period:$('filter').value}});}
$('attention').addEventListener('click',()=>{submission='all';$('filter').value='unknown';render();rememberView();});
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.kind;render();rememberView();}));
document.querySelectorAll('[data-submission]').forEach(b=>b.addEventListener('click',()=>{submission=b.dataset.submission;if($('filter').value==='unknown')$('filter').value='all';render();rememberView();}));
function syncPeriod(){
  for(const option of document.querySelectorAll('[data-period]')){
    const selected=option.dataset.period===$('filter').value;
    option.setAttribute('aria-selected',String(selected));
    if(selected)$('filter-label').textContent=option.textContent;
  }
}
function closePeriod(restoreFocus=false){$('filter-menu').hidden=true;$('filter-toggle').setAttribute('aria-expanded','false');if(restoreFocus)$('filter-toggle').focus();}
function openPeriod(){
  $('filter-menu').hidden=false;$('filter-toggle').setAttribute('aria-expanded','true');
  $('filter-menu').querySelector('[aria-selected="true"]')?.focus();
}
$('filter-toggle').addEventListener('click',()=>$('filter-menu').hidden?openPeriod():closePeriod());
$('filter-toggle').addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openPeriod();}});
document.querySelectorAll('[data-period]').forEach(option=>option.addEventListener('click',()=>{
  $('filter').value=option.dataset.period;
  if($('filter').value==='unknown')submission='all';
  render();rememberView();closePeriod(true);
}));
$('filter-menu').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closePeriod(true);return;}
  const options=[...document.querySelectorAll('[data-period]')],index=options.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
    options[next].focus();
  }
});
document.addEventListener('click',event=>{if(!event.target.closest('.filter-control'))closePeriod();});
document.addEventListener('focusin',event=>{if(!event.target.closest('.filter-control'))closePeriod();});
function applyData(data){
  if(Object.hasOwn(data,'snapshot')){const snapshot=data.snapshot||{};items=snapshot.items||[];warnings=snapshot.warnings||[];checkedAt=snapshot.checkedAt||null;fullyCheckedAt=snapshot.fullyCheckedAt||null;}
  if(Object.hasOwn(data,'job'))job=data.job||null;
  if(Object.hasOwn(data,'courseList'))courseList=data.courseList||[];
  if(Object.hasOwn(data,'selectedUrls'))selectedUrls=data.selectedUrls??null;
  renderCourses();renderJob();render();
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local')return;
  if(changes.allWeeks)$('all-weeks').checked=changes.allWeeks.newValue===true;
  const data={};
  for(const key of ['snapshot','job','courseList','selectedUrls'])if(changes[key])data[key]=changes[key].newValue;
  if(Object.keys(data).length)applyData(data);
});
try{
  const data=await chrome.storage.local.get(['snapshot','job','courseList','selectedUrls','view','scanIncomplete','theme','allWeeks']);
  $('all-weeks').checked=data.allWeeks===true;
  if(data.theme==='light'){document.documentElement.dataset.theme='light';$('theme').checked=false;}
  if(data.view){kind=data.view.kind||kind;submission=data.view.submission||submission;$('filter').value=data.view.period||'all';}
  applyData(data);
  if(!items.length&&!courseList.length)openSettings();
  try{const result=await requestJob({type:'job:sync'});if(!result?.ok)throw Error(result?.error||'수집 기능에 연결하지 못했습니다.');}
  catch(error){showStatus(error.message,true);}
}catch(error){showStatus(`상태 확인 실패: ${error.message}`,true);render();}
setInterval(()=>{if(!busy)render();},60000);
