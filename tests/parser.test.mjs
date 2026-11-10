import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {assignments,progress,phase,kstDate,safeURL,activityCatalog,courses} from '../extension/parser.js';
const doc=html=>parseHTML(`<html><body>${html}</body></html>`).document;
const course={name:'합성 테스트 과목',url:'https://eclass.dongguk.edu/course/view.php?id=1'};
const tasks=doc(`<table><thead><tr><th>주차</th><th>종료 일시</th><th>제출</th><th>제목</th></tr></thead><tbody>
<tr><td>1</td><td>2026/11/16 00:00</td><td>미제출</td><td><a href="/mod/assign/view.php?id=1">A</a></td></tr>
<tr><td>2</td><td>2026/11/17 00:00</td><td>제출 완료</td><td><a href="/mod/assign/view.php?id=2">B</a></td></tr>
<tr><td>3</td><td>-</td><td>초안</td><td><a href="/mod/assign/view.php?id=3">C</a></td></tr>
<tr><td>4</td><td>-</td><td>처음보는 상태</td><td><a href="/mod/assign/view.php?id=4">D</a></td></tr>
</tbody></table>`);
const a=assignments(tasks,course);
assert.equal(a.recognized,true);assert.deepEqual(a.items.map(i=>i.state),['pending','done','pending','unknown']);
assert.equal(a.items[0].due,Date.parse('2026-11-16T00:00:00+09:00'));
assert.equal(assignments(doc('<p>로그인</p>'),course).recognized,false);
const catalog=activityCatalog(doc(`<li class="activity modtype_vod"><span class="instancename">영상 A<span class="accesshide"> 동영상</span></span><div class="activityinstance"><a href="/mod/vod/view.php?id=1">보기</a></div><div class="displayoptions">2026-11-05 00:00:00 ~ 2026-11-10 23:59:59 (지각 : 2026-11-11 23:59:59)</div></li>`),course);
assert.equal(catalog[0].title,'영상 A');assert.equal(catalog[0].due,Date.parse('2026-11-10T23:59:59+09:00'));
const p=progress(doc(`<table class="user_progress_table"><thead><tr><th>출석인정 요구시간</th></tr></thead><tbody>
<tr><td rowspan="2">10주차</td><td>2차시</td><td><img src="/theme/vod/icon">영상 A</td><td>23:00</td><td>25:49<button data-eterm="1794322799">2회 열람</button></td><td>O</td><td rowspan="2">▲</td></tr>
<tr><td><img src="/theme/quiz/icon">퀴즈</td><td>-</td><td>-</td><td>X</td></tr>
<tr><td>11주차</td><td>1차시</td><td><img src="/theme/vod/icon">영상 B</td><td>20:00</td><td>-</td><td></td><td></td></tr>
<tr><td><img src="/theme/vod/icon">영상 C</td><td>20:00</td><td>00:00</td><td>X</td></tr>
</tbody></table>`),course,[...catalog,{type:'vod',title:'영상 B',start:Date.parse('2026-11-10T00:00:00+09:00'),url:course.url}],Date.parse('2026-11-08T00:00:00+09:00'));
assert.equal(p.items.length,3);assert.deepEqual(p.items.map(i=>i.state),['done','upcoming','pending']);
assert.match(p.items[0].evidence,/학습 25:49/);assert.equal(phase(p.items[0]),'done');
assert.equal(phase({state:'pending',due:1},2),'expired');assert.equal(phase({state:'unknown',due:1},2),'unknown');
assert.equal(phase({state:'pending',start:10,due:20},2),'upcoming');assert.equal(phase({state:'late'},2),'done');
assert.equal(safeURL('javascript:alert(1)'),null);assert.equal(safeURL('https://evil.example/'),null);assert.equal(safeURL(null),null);
assert.equal(kstDate('모름'),null);
assert.equal(courses(doc('<a class="course-link" href="/course/view.php?id=1"><h3>강좌</h3><div class="course-label">교과</div></a>'))[0].name,'강좌');
console.log('PASS: assignment states, unknown formats, Korean time, activity catalog, rowspans, individual vs weekly attendance, upcoming, expired, safe links, course discovery');
