import {test,expect,chromium} from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {fixture} from './fixtures.mjs';

test('installed MV3 popup, CSP, unknown items and theme/grid rendering',async({},testInfo)=>{
 // Offscreen fetches are not intercepted by page routing. Replace only that
 // network boundary in a temporary extension copy; never call the school server.
 const temporary=await mkdtemp(path.join(os.tmpdir(),'eclass-mv3-'));
 const extension=path.join(temporary,'extension');await cp(path.resolve('extension'),extension,{recursive:true});
 const paths=['/','/course/view.php','/mod/assign/index.php','/local/ubattendance/attendance_book.php','/report/ubcompletion/progress.php'];
 const responses=Object.fromEntries(paths.map(p=>[p,fixture('https://eclass.dongguk.edu'+p)]));
 await writeFile(path.join(extension,'network-fixture.js'),`const responses=${JSON.stringify(responses)};globalThis.fetch=async(url,options={})=>{if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');const parsed=new URL(url);if(parsed.origin!=='https://eclass.dongguk.edu'||!responses[parsed.pathname])throw Error('Unexpected fixture request');return {ok:true,url:parsed.href,text:async()=>responses[parsed.pathname]};};`);
 const offscreen=path.join(extension,'offscreen.html');await writeFile(offscreen,(await readFile(offscreen,'utf8')).replace('<script','<script src="network-fixture.js"></script><script'));
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const routed=[];
 try{
  await context.route('https://eclass.dongguk.edu/**',async route=>{
   routed.push(route.request().url());
   const html=fixture(route.request().url());
   await route.fulfill({status:200,contentType:html?'text/html':'image/svg+xml',body:html||'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="9" fill="#dd7733"/></svg>'});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const extensionId=new URL(worker.url()).host;
  const popup=await context.newPage(),errors=[];
  popup.on('pageerror',error=>errors.push(error.message));
  popup.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|inline event/i.test(message.text()))errors.push(message.text());});
  await popup.setViewportSize({width:480,height:600});await popup.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await popup.getByRole('button',{name:'강좌 불러오기',exact:true}).click();
  try{await expect(popup.locator('#courses input')).toHaveCount(1,{timeout:15000});}
  catch(error){console.log('Course load diagnostics',JSON.stringify({routed,status:await popup.locator('#settings-status').textContent(),state:await worker.evaluate(()=>chrome.storage.local.get(['job','courseList']))}));throw error;}
  await popup.getByRole('button',{name:'선택 강좌 확인',exact:true}).click();
  await expect(popup.locator('#settings-status')).toContainText('미지원 자료', {timeout:30000});
  await popup.getByRole('button',{name:'설정 닫기'}).click();
  await popup.getByRole('button',{name:'확인 필요 1건 · 직접 확인 ›',exact:true}).click();
  await expect(popup.locator('#results')).toContainText('확인 필요한 과제');
  const originalSnapshot=await worker.evaluate(async()=> (await chrome.storage.local.get('snapshot')).snapshot);
  await worker.evaluate(async()=>{
   const {snapshot}=await chrome.storage.local.get('snapshot');
   await chrome.storage.local.set({snapshot:{...snapshot,items:snapshot.items.map(i=>i.kind==='과제'?{...i,state:'pending',stale:true}:i)}});
  });
  await expect(popup.locator('#results .badge')).toHaveText('확인 필요');
  await expect(popup.locator('#results')).toContainText('갱신 필요 · 이전 미제출');
  await popup.locator('[data-submission="pending"]').click();
  await expect(popup.locator('#results .item')).toHaveCount(0);
  await worker.evaluate(async snapshot=>chrome.storage.local.set({snapshot}),originalSnapshot);
  await popup.getByRole('button',{name:'확인 필요 1건 · 직접 확인 ›',exact:true}).click();
  await popup.locator('[data-kind="동영상"]').click();
  await popup.getByRole('button',{name:'확인 필요 1건 · 직접 확인 ›',exact:true}).click();
  await expect(popup.locator('#results')).toContainText('출석 자동 확인 불가');
  await popup.getByRole('switch',{name:'다크 모드',exact:true}).uncheck();
  await expect(popup.locator('html')).toHaveAttribute('data-theme','light');
  await expect(popup.locator('[data-submission="pending"]')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await popup.getByRole('button',{name:'설정',exact:true}).click();
  await expect(popup.getByRole('switch',{name:'백그라운드 자동 갱신'})).toBeChecked();
  await popup.getByLabel('갱신 간격',{exact:true}).selectOption('30');
  await expect.poll(()=>worker.evaluate(async()=> (await chrome.alarms.get('eclass-auto-refresh'))?.periodInMinutes)).toBe(30);
  await popup.getByRole('switch',{name:'백그라운드 자동 갱신'}).uncheck();
  await expect(popup.getByLabel('갱신 간격',{exact:true})).toBeDisabled();
  await expect.poll(()=>worker.evaluate(async()=>!!(await chrome.alarms.get('eclass-auto-refresh')))).toBe(false);
  await popup.getByRole('switch',{name:'백그라운드 자동 갱신'}).check();
  await expect.poll(()=>worker.evaluate(async()=> (await chrome.alarms.get('eclass-auto-refresh'))?.periodInMinutes)).toBe(30);
  await popup.getByRole('switch',{name:'모든 주차 한 번에 보기'}).check();
  await popup.getByRole('button',{name:'설정 닫기'}).click();
  await expect(popup.locator('#csp-status')).toHaveText('이번 팝업의 CSP 차단: 0건');
  expect(errors).toEqual([]);
  await popup.screenshot({path:testInfo.outputPath('popup-light.png')});
  await popup.getByRole('switch',{name:'다크 모드',exact:true}).check();
  await expect(popup.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(popup.locator('[data-submission="pending"]')).toHaveCSS('background-color','rgb(24, 19, 15)');
  await expect(popup.locator('.switch-thumb')).toHaveCSS('transform','matrix(1, 0, 0, 1, 24, 0)');
  await popup.screenshot({path:testInfo.outputPath('popup-dark.png')});
  const page=await context.newPage();await page.goto('https://eclass.dongguk.edu/course/view.php?id=1');
  await expect(page.locator('#dg-week-layouts')).toBeVisible();
  for(const dark of [false,true]){
   await page.getByRole('switch',{name:'e-Class 사이트 다크 모드'}).setChecked(dark);
   for(const width of [480,960,1600,2800]){
    await page.setViewportSize({width,height:900});
    for(const layout of ['2','4','8','auto']){
     await page.locator(`#dg-week-layouts [data-layout="${layout}"]`).click();
     const metrics=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('.flexsections-level-1 > .section')];
      return cards.map(card=>{
       const title=card.querySelector('.instancename').getBoundingClientRect(),notice=card.querySelector('.availabilityinfo').getBoundingClientRect();
       return {overflow:card.scrollWidth>card.clientWidth+1,titleWidth:title.width,noticeBelow:notice.top>=title.bottom-1};
      });
     });
     for(const metric of metrics){expect(metric.overflow).toBe(false);expect(metric.titleWidth).toBeGreaterThan(64);expect(metric.noticeBelow).toBe(true);}
    }
    await page.screenshot({path:testInfo.outputPath(`grid-${dark?'dark':'light'}-${width}.png`)});
   }
   if(dark){
    const colors=await page.locator('.ubboard_view .content').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    expect(colors.background).toBe('rgb(32, 28, 24)');expect(colors.color).toBe('rgb(223, 214, 206)');
   }else{
    await expect(page.locator('.ubboard_view .content')).toHaveCSS('background-color','rgb(255, 255, 255)');
   }
   await expect(page.locator('.activityicon').first()).toHaveCSS('filter','none');
  }
  await popup.close();
  await worker.evaluate(async()=>{
   const {job}=await chrome.storage.local.get('job');
   await chrome.storage.local.set({job:{...job,startedAt:1},autoRefreshAttemptAt:0});
   await chrome.alarms.create('eclass-auto-refresh',{when:Date.now()+500,periodInMinutes:30});
  });
  await expect.poll(()=>worker.evaluate(async()=>{const {job}=await chrome.storage.local.get('job');return job?.automatic===true&&job.status==='partial';}),{timeout:15000}).toBe(true);
  const reopened=await context.newPage();await reopened.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(reopened.locator('#settings-status')).toContainText('미지원 자료');
 }finally{
  await context.close();
  if(path.dirname(path.resolve(temporary))===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('eclass-mv3-'))await rm(temporary,{recursive:true,force:true});
 }
});
