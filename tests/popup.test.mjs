import assert from 'node:assert/strict';
import {visibleItems,deadlineRemaining} from '../extension/filters.js';
const items=[
 {kind:'과제',state:'pending',title:'미제출 과제',course:'알고리즘',due:20},
 {kind:'과제',state:'done',title:'제출한 과제',course:'알고리즘',due:30},
 {kind:'과제',state:'pending',title:'지난 과제',course:'공학경제',due:1},
 {kind:'과제',state:'unknown',title:'확인 필요',course:'공학경제',due:40},
 {kind:'동영상',state:'done',title:'수강한 영상',course:'공학경제',due:30}
];
const opts={kind:'과제',submission:'pending',period:'all',now:10};
assert.deepEqual(visibleItems(items,opts).map(i=>i.title),['지난 과제','미제출 과제']);
assert.deepEqual(visibleItems(items,{...opts,submission:'done',period:'active'}).map(i=>i.title),['제출한 과제']);
assert.equal(visibleItems(items,{...opts,submission:'all'}).length,4);
assert.equal(visibleItems(items,{...opts,submission:'all',period:'unknown'})[0].state,'unknown');
assert.equal(visibleItems(items,{...opts,submission:'done',kind:'동영상'})[0].title,'수강한 영상');
assert.equal(visibleItems(items,{...opts,period:'active'}).length,1);
assert.equal(visibleItems([{kind:'과제',state:'pending',title:'기한 없음',course:'A',due:null}],{...opts,period:'active'}).length,0);
assert.equal(deadlineRemaining(30*60000,0),'30분 남음');
assert.equal(deadlineRemaining(3*3600000,0),'3시간 남음');
assert.equal(deadlineRemaining(1,2),'마감 지남');
assert.equal(deadlineRemaining(2*86400000,0),'D-2');
console.log('PASS: submission toggles, submitted tasks before deadline, unknown states, video separation, expired tasks');
