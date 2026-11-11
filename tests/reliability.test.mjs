import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser} from 'linkedom';
import {progress,phase,activityCatalog} from '../extension/parser.js';
import {scanCourses} from '../extension/scan-engine.js';
import {visibleItems} from '../extension/filters.js';
const doc=html=>new DOMParser().parseFromString(`<html><body>${html}</body></html>`,'text/html');
const course={name:'합성 강좌',url:'https://eclass.dongguk.edu/course/view.php?id=1'};
const row=(prefix,material)=>`<tr>${prefix}<td>${material}</td><td>20:00</td><td>00:00</td><td>X</td></tr>`;
const table=rows=>`<table class="user_progress_table"><thead><tr><th>출석인정 요구시간</th></tr></thead><tbody>${rows}</tbody></table>`;

test('failed refresh cannot assert an old pending status; refreshed submission replaces it even if video fails',async()=>{
 const previous={checkedAt:10,items:[{kind:'과제',title:'합성 팀 보고서',course:course.name,courseUrl:course.url,url:'https://eclass.dongguk.edu/mod/assign/view.php?id=7',due:200,state:'pending'}]};
 const failed=await scanCourses({selected:[course],previous,read:async()=>{throw Error('network failure');}});
 const old=failed.snapshot.items[0];assert.equal(old.state,'pending');assert.equal(old.stale,true);assert.equal(phase(old,100),'unknown');
 const options={kind:'과제',submission:'pending',period:'all',now:100};
 assert.equal(visibleItems(failed.snapshot.items,options).length,0);
 assert.equal(visibleItems(failed.snapshot.items,{...options,submission:'all',period:'unknown'}).length,1);
 assert.equal(phase({...old,state:'done'},100),'unknown','Old submitted status must not claim current submission either');
 const refreshed=await scanCourses({selected:[course],previous:failed.snapshot,now:()=>100,read:async url=>{
  if(url===course.url)return doc('<a href="/mod/assign/index.php?id=1">과제</a>');
  return doc('<table><thead><tr><th>주차</th><th>학사 기간</th><th>차시</th><th>주제</th><th>제목</th><th>종료 일시</th><th>제출</th><th>성적</th></tr></thead><tbody><tr><td>10주차</td><td>2099/11/03 ~ 2099/11/09</td><td>2차시</td><td>2차시</td><td><a href="/mod/assign/view.php?id=7">합성 팀 보고서</a></td><td>2099/11/11 23:59</td><td>제출 완료</td><td>-</td></tr></tbody></table>');
 }});
 assert.equal(refreshed.partial,true,'Unrelated missing attendance scope still reports failure');
 assert.equal(refreshed.snapshot.items.length,1);assert.equal(refreshed.snapshot.items[0].state,'done');assert.equal(refreshed.snapshot.items[0].stale,false);
 assert.equal(visibleItems(refreshed.snapshot.items,{...options,submission:'done'}).length,1);
 assert.equal(visibleItems(refreshed.snapshot.items,options).length,0);
});

test('unsupported learning is reported without guessing attendance or silently dropping it',async()=>{
 const home=doc('<a href="/mod/assign/index.php?id=1">과제</a><a href="/local/ubattendance/attendance_book.php?id=1">출석부</a><li class="activity modtype_econtents"><div class="activityinstance"><a href="/mod/econtents/view.php?id=5"><span class="instancename">이러닝 콘텐츠</span></a></div></li>');
 const result=await scanCourses({selected:[course],signal:new AbortController().signal,now:()=>100,read:async url=>{
  if(url===course.url)return home;
  if(url.includes('/mod/assign/'))return doc('<table><thead><tr><th>종료 일시</th><th>제출</th></tr></thead><tbody></tbody></table>');
  if(url.includes('/local/ubattendance/'))return doc('<a href="/report/ubcompletion/progress.php?id=1">출석부</a>');
  return doc(table(row('','<img src="/theme/econtents/icon">이러닝 콘텐츠')));
 }});
 assert.equal(result.partial,true);assert.equal(result.snapshot.coverageIncomplete,true);assert.equal(result.snapshot.fullyCheckedAt,null);
 assert.equal(result.snapshot.items.length,1,'Catalog and attendance references must deduplicate');
 const item=result.snapshot.items[0];assert.equal(item.state,'unknown');assert.equal(item.unsupported,true);assert.match(item.url,/econtents\/view/);
 assert.match(result.snapshot.warnings[0],/미지원 학습 자료 1개/);
 assert.equal(phase({...item,start:200},100),'unknown');
});

test('video matches use module identity then week/session, with safe ambiguous fallback',()=>{
 const catalog=[{type:'vod',title:'강의 영상',url:'https://eclass.dongguk.edu/mod/vod/view.php?id=10',week:1,session:1,start:10},
 {type:'vod',title:'강의 영상',url:'https://eclass.dongguk.edu/mod/vod/view.php?id=20',week:2,session:1,start:20}];
 const byId=progress(doc(table(row('','<a href="/mod/vod/view.php?id=20"><img src="/theme/vod/icon">변경된 제목</a>'))),course,catalog,100).items[0];
 assert.equal(byId.url,catalog[1].url);assert.equal(byId.start,20);
 const byWeek=progress(doc(table(row('<td>2주차</td><td>1차시</td>','<img src="/theme/vod/icon">강의 영상'))),course,catalog,100).items[0];
 assert.equal(byWeek.url,catalog[1].url);
 const ambiguous=progress(doc(table(row('','<img src="/theme/vod/icon">강의 영상'))),course,catalog,100).items[0];assert.equal(ambiguous.url,course.url);assert.equal(ambiguous.start,null);
 const parsed=activityCatalog(doc('<li class="section"><h3 class="sectionname">2주차</h3><ul><li class="section"><h3 class="sectionname">1차시</h3><ul><li class="activity modtype_vod" id="module-20"><div class="activityinstance"><a href="/mod/vod/view.php?id=20"><span class="instancename">강의 영상</span></a></div></li></ul></li></ul></li>'),course)[0];
 assert.equal(parsed.moduleId,'20');assert.equal(parsed.week,2);assert.equal(parsed.session,1);
});

test('unknown submission is not presented as a fully verified course',async()=>{
 const result=await scanCourses({selected:[course],signal:new AbortController().signal,read:async url=>{
  if(url===course.url)return doc('<a href="/mod/assign/index.php?id=1">과제</a><a href="/local/ubattendance/attendance_book.php?id=1">출석부</a>');
  if(url.includes('/mod/assign/'))return doc('<table><thead><tr><th>제목</th><th>종료 일시</th><th>제출</th></tr></thead><tbody><tr><td><a href="/mod/assign/view.php?id=7">합성 과제</a></td><td>2099/11/01 23:59</td><td>판별 불가</td></tr></tbody></table>');
  if(url.includes('/local/ubattendance/'))return doc('<a href="/report/ubcompletion/progress.php?id=1">출석부</a>');
  return doc(table(''));
 }});
 assert.equal(result.partial,true);assert.equal(result.snapshot.coverageIncomplete,true);assert.equal(result.snapshot.fullyCheckedAt,null);assert.match(result.message,/확인 필요 1개/);
});

test('calendar retries, cached date rollover, and all-weeks off restoration',async()=>{
 let clock=Date.parse('2026-11-08T00:00:00+09:00'),calls=0;const timers=[],listeners=[];
 const d=doc(`<a href="https://eclass.dongguk.edu/mod/assign/index.php?id=1">과제</a><div class="course-content"><ul class="section_tab">${Array.from({length:16},(_,i)=>`<li id="section-${i+1}" class="${i===7?'active':''}"><a href="#section-${i+1}">${i+1}주차</a></li>`).join('')}</ul><ul class="flexsections-level-1">${Array.from({length:16},(_,i)=>`<li class="section main" id="section-${i+1}"><h3 class="sectionname">${i+1}주차</h3></li>`).join('')}</ul></div>`);
 class Clock extends Date{static now(){return clock;}}
 vm.runInNewContext(await readFile('extension/course-weeks.js','utf8'),{document:d,Date:Clock,URL,DOMParser,AbortController,location:{origin:'https://eclass.dongguk.edu',href:course.url},
  MutationObserver:class{observe(){}},setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimeout:t=>{t.cleared=true;},setInterval:()=>null,
  chrome:{storage:{onChanged:{addListener:fn=>listeners.push(fn)},local:{get:async()=>({allWeeks:true,hideEmptyWeeks:true}),set:async()=>{}}}},
  fetch:async()=>{if(++calls===1)throw Error('Temporary network error');return {ok:true,url:'https://eclass.dongguk.edu/mod/assign/index.php?id=1',text:async()=>'<table><thead><tr><th>학사 기간</th></tr></thead><tbody><tr><td>2주차</td><td>2026/09/08 ~ 2026/09/14</td></tr></tbody></table>'};}});
 await new Promise(r=>setImmediate(r));assert.equal(d.querySelector('.dg-week-mark').textContent,'선택됨');
 timers.find(t=>t.delay===5000&&!t.cleared).fn();await new Promise(r=>setImmediate(r));
 assert.equal(d.querySelector('.flexsections-level-1 .dg-current-week').id,'section-10');
 clock=Date.parse('2026-11-15T00:00:00+09:00');d.dispatchEvent(new d.defaultView.Event('visibilitychange'));
 assert.equal(d.querySelector('.flexsections-level-1 .dg-current-week').id,'section-11');assert.equal(calls,2);
 listeners.forEach(fn=>fn({allWeeks:{newValue:false}},'local'));assert.equal(d.querySelectorAll('.dg-week-mark').length,0);
});
