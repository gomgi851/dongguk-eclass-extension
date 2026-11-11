import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AUTO_ALARM,installAutoRefresh,refreshMinutes} from '../extension/auto-refresh.js';

test('alarms restore after restart, settings reschedule, and scheduled reads honor selection, auth and locks',async()=>{
 const data={courseList:[{category:'교과',url:'course-a'},{category:'자율강좌',url:'course-b'}]},alarms=new Map(),listeners={};
 let clock=10000000,calls=0,reconciled=0,release;
 const event=name=>({addListener(fn){listeners[name]=fn;}});
 const api={runtime:{onInstalled:event('installed'),onStartup:event('startup')},
  storage:{onChanged:event('storage'),local:{async get(keys){return Object.fromEntries(keys.map(k=>[k,data[k]]));},async set(value){Object.assign(data,value);}}},
  alarms:{onAlarm:event('alarm'),async get(name){return alarms.get(name);},async create(name,options){alarms.set(name,options);},async clear(name){alarms.delete(name);}}};
 const scheduler=installAutoRefresh({api,now:()=>clock,beforeRun:async()=>{reconciled++;},startJob:async message=>{calls++;assert.equal(message.automatic,true);assert.deepEqual(message.selectedUrls,['course-a']);if(release)await new Promise(r=>{release=r;});return {ok:true};}});
 await scheduler.schedule();assert.equal(alarms.get(AUTO_ALARM).periodInMinutes,15);
 data.autoRefreshMinutes=30;await listeners.storage({autoRefreshMinutes:{newValue:30}},'local');assert.equal(alarms.get(AUTO_ALARM).periodInMinutes,30);
 data.autoRefresh=false;await listeners.storage({autoRefresh:{newValue:false}},'local');assert.equal(alarms.has(AUTO_ALARM),false);await scheduler.run();assert.equal(calls,0);
 data.autoRefresh=true;await listeners.installed();assert.equal(alarms.get(AUTO_ALARM).periodInMinutes,30);
 await listeners.alarm({name:'other'});assert.equal(calls,0);
 data.selectedUrls=[];await scheduler.run();assert.equal(calls,0,'Explicitly deselected courses must not fall back to defaults');
 delete data.selectedUrls;
 data.job={status:'running'};await scheduler.run();assert.equal(calls,0);
 data.job={mode:'scan',startedAt:clock-100};await scheduler.run();assert.equal(calls,0,'Recent manual reads suppress duplicate polling');
 data.job={status:'complete'};await listeners.alarm({name:AUTO_ALARM});assert.equal(calls,1);
 await scheduler.run();assert.equal(calls,1,'Persisted attempt time prevents repeated starts after worker restart');
 clock+=30*60000;release=true;
 const first=scheduler.run(),second=scheduler.run();await new Promise(r=>setImmediate(r));assert.equal(calls,2);release();await Promise.all([first,second]);release=null;
 alarms.clear();await listeners.startup();assert.equal(alarms.get(AUTO_ALARM).periodInMinutes,30);assert.equal(calls,2);
 clock+=30*60000;data.job={authExpired:true};await listeners.startup();assert.equal(calls,3,'Check again next period so a restored login can resume without clicking');
 assert.ok(reconciled>0);assert.equal(refreshMinutes(-1),15);assert.equal(refreshMinutes(5),5);
});
