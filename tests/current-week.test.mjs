import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser} from 'linkedom';
const source=await readFile('extension/course-weeks.js','utf8');
async function run(calendar){
 const doc=new DOMParser().parseFromString(`<html><body><a href="https://eclass.dongguk.edu/mod/assign/index.php?id=1">과제</a><div class="course-content"><ul class="section_tab">${Array.from({length:16},(_,i)=>`<li id="section-${i+1}" class="${i===7?'active':''}"><a href="#section-${i+1}">${i+1}주차</a></li>`).join('')}</ul><ul class="flexsections-level-1">${Array.from({length:16},(_,i)=>`<li class="section main" id="section-${i+1}"><h3 class="sectionname">${i+1}주차</h3></li>`).join('')}</ul></div></body></html>`,'text/html');
 class FixedDate extends Date{static now(){return Date.parse('2026-11-08T00:00:00+09:00');}}
 vm.runInNewContext(source,{document:doc,chrome:{storage:{onChanged:{addListener(){}},local:{get:async()=>({allWeeks:true,hideEmptyWeeks:true}),set:async()=>{}}}},MutationObserver:class{observe(){}},URL,location:{href:'https://eclass.dongguk.edu/course/view.php?id=1',origin:'https://eclass.dongguk.edu'},AbortController,setTimeout,clearTimeout,DOMParser,Date:FixedDate,fetch:async()=>({ok:true,url:'https://eclass.dongguk.edu/mod/assign/index.php?id=1',text:async()=>calendar})});
 await new Promise(resolve=>setImmediate(resolve));return doc;
}
const calendar='<table><thead><tr><th>학사 기간</th></tr></thead><tbody><tr><td>2주차</td><td>2026/09/08 ~ 2026/09/14</td></tr><tr><td>4주차</td><td>2026/09/22 ~ 2026/09/28</td></tr></tbody></table>';
const valid=await run(calendar),current=valid.querySelector('.flexsections-level-1 .dg-current-week');
assert.equal(current.id,'section-10');assert.equal(current.querySelector('.dg-week-mark').textContent,'이번 주');assert.equal(current.classList.contains('dg-empty-week'),false);assert.equal(valid.querySelectorAll('.dg-selected-week').length,0);
const unavailable=await run('<h1>로그인</h1>');assert.equal(unavailable.querySelectorAll('.dg-current-week').length,0);assert.equal(unavailable.querySelector('.dg-selected-week').id,'section-8');assert.equal(unavailable.querySelector('.dg-week-mark').textContent,'선택됨');
console.log('PASS: academic calendar identifies current week, preserves empty current week, unavailable calendar uses selected-week label');
