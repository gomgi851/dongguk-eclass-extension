import {test,expect,chromium} from '@playwright/test';
import path from 'node:path';
import {fixture} from './fixtures.mjs';

test('installed MV3 popup, CSP, unknown items and theme/grid rendering',async({},testInfo)=>{
 const extension=path.resolve('extension');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
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
  await popup.locator('[data-kind="동영상"]').click();
  await popup.getByRole('button',{name:'확인 필요 1건 · 직접 확인 ›',exact:true}).click();
  await expect(popup.locator('#results')).toContainText('출석 자동 확인 불가');
  await popup.getByRole('switch',{name:'다크 모드',exact:true}).uncheck();
  await popup.getByRole('button',{name:'설정',exact:true}).click();
  await popup.getByRole('switch',{name:'모든 주차 한 번에 보기'}).check();
  await popup.getByRole('button',{name:'설정 닫기'}).click();
  await expect(popup.locator('#csp-status')).toHaveText('이번 팝업의 CSP 차단: 0건');
  expect(errors).toEqual([]);
  await popup.screenshot({path:testInfo.outputPath('popup-light.png')});
  await popup.getByRole('switch',{name:'다크 모드',exact:true}).check();
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
 }finally{await context.tracing.stop({path:testInfo.outputPath('extension-trace.zip')});await context.close();}
});
