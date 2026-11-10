(() => {
  // Only change the client-side week tabs observed in Dongguk's flexsections format.
  // Leave every activity, completion button and server-side availability rule intact.
  const root=document.documentElement;
  let revision=0,hideEmpty=false,button=null,summary=null,layout='1',layoutButtons=[],currentWeek=null;
  let calendarDoc=null,calendarLoading=false,calendarAttempts=0,calendarAttemptAt=0,retryTimer=null;
  const initialSelected=document.querySelector('.course-content .section_tab > .active')?.id;
  const layouts=new Set(['1','2','4','8','auto']);
  const sections=()=>[...document.querySelectorAll('.course-content ul.flexsections-level-1 > li.section')];
  function calendarWeek(doc,now){
    const table=[...doc.querySelectorAll('table')].find(el=>/학사\s*기간/.test(el.querySelector('thead')?.textContent||''));
    if(!table)return null;
    const day=86400000,today=Math.floor((now+9*3600000)/day)*day,anchors=[];
    for(const row of table.querySelectorAll('tbody tr')){
      const text=row.textContent,week=text.match(/(\d{1,2})\s*주차/),dates=[...text.matchAll(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/g)];
      if(!week||dates.length<2)continue;
      const n=Number(week[1]),start=Date.UTC(+dates[0][1],+dates[0][2]-1,+dates[0][3]),end=Date.UTC(+dates[1][1],+dates[1][2]-1,+dates[1][3]);
      if(n<1||n>30||end-start!==6*day)continue;
      if(today>=start&&today<=end)return n;
      anchors.push(start-(n-1)*7*day);
    }
    if(!anchors.length||new Set(anchors).size!==1)return null;
    const week=Math.floor((today-anchors[0])/(7*day))+1;
    return week>=1&&week<=sections().length?week:null;
  }
  async function loadCalendar(){
    if(calendarDoc||calendarLoading||retryTimer||calendarAttempts>=3||!root.classList.contains('dg-all-weeks')||!sections().length)return;
    const link=document.querySelector('a[href*="/mod/assign/index.php"]');
    if(!link)return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||url.pathname!=='/mod/assign/index.php')return;
    calendarLoading=true;calendarAttempts++;calendarAttemptAt=Date.now();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(url.href,{credentials:'include',cache:'no-store',signal:controller.signal});
      if(!response.ok||new URL(response.url||url.href).origin!==location.origin)throw Error('학사 기간 조회 실패');
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      if(![...doc.querySelectorAll('table thead')].some(el=>/학사\s*기간/.test(el.textContent)))throw Error('학사 기간 없음');
      calendarDoc=doc;
      currentWeek=calendarWeek(calendarDoc,Date.now());
      update();
    }catch{
      // Keep the selected-week fallback and retry transient failures at most twice.
      if(calendarAttempts<3){retryTimer=setTimeout(()=>{retryTimer=null;loadCalendar();},5000*calendarAttempts);retryTimer?.unref?.();}
    }
    finally{calendarLoading=false;clearTimeout(timer);}
  }
  function empty(section){
    if(section.querySelector('.activity,.availabilityinfo,img,svg,video,audio,iframe,object,embed,table,input,button,a[href]'))return false;
    const copy=section.cloneNode(true);
    copy.querySelectorAll('.sectionname,.accesshide').forEach(el=>el.remove());
    return !copy.textContent.replace(/[\s\u00a0\u200b]/g,'');
  }
  function update(){
    const weeks=sections(),nav=document.querySelector('.course-content .section_tab');
    if(!nav||!weeks.length)return;
    if(!button){
      const tools=document.createElement('div');tools.id='dg-week-tools';
      button=document.createElement('button');button.type='button';button.id='dg-hide-empty';
      summary=document.createElement('span');summary.setAttribute('role','status');
      const layoutGroup=document.createElement('div');layoutGroup.id='dg-week-layouts';layoutGroup.setAttribute('role','group');layoutGroup.setAttribute('aria-label','주차 배열');
      for(const [value,title] of [['1','목록'],['2','2열 · 16주차 기준 8행'],['4','4열 · 16주차 기준 4행'],['8','8열 · 16주차 기준 2행'],['auto','자동 그리드']]){
        const option=document.createElement('button');option.type='button';option.dataset.layout=value;option.title=title+' · 좁은 화면에서는 열 수 자동 조정';option.setAttribute('aria-label',title);
        if(value==='auto')option.textContent='AUTO';
        else{
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','21');svg.setAttribute('height','21');svg.setAttribute('aria-hidden','true');
          const boxes=value==='1'?[[3,4,18,3],[3,10.5,18,3],[3,17,18,3]]:value==='2'?[[3,3,7.5,18],[13.5,3,7.5,18]]:value==='4'?[[3,3,7.5,7.5],[13.5,3,7.5,7.5],[3,13.5,7.5,7.5],[13.5,13.5,7.5,7.5]]:Array.from({length:8},(_,i)=>[2+(i%4)*5.5,5+Math.floor(i/4)*8,3.8,6]);
          for(const [x,y,width,height] of boxes){const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [key,n] of Object.entries({x,y,width,height,rx:1}))rect.setAttribute(key,String(n));rect.setAttribute('fill','currentColor');svg.append(rect);}
          option.append(svg);
        }
        option.addEventListener('click',()=>{layout=value;update();chrome.storage.local.set({weekLayout:layout});});
        layoutButtons.push(option);layoutGroup.append(option);
      }
      button.addEventListener('click',()=>{
        hideEmpty=!hideEmpty;update();chrome.storage.local.set({hideEmptyWeeks:hideEmpty});
      });
      tools.append(button,summary,layoutGroup);nav.before(tools);
    }
    if(calendarDoc)currentWeek=calendarWeek(calendarDoc,Date.now());
    const expanded=root.classList.contains('dg-all-weeks'),emptyIds=new Set();
    const currentId=expanded&&currentWeek?weeks.find(week=>Number(week.querySelector('.sectionname')?.textContent.match(/(\d+)\s*주차/)?.[1])===currentWeek)?.id:null;
    for(const week of weeks){
      const current=week.id===currentId,selected=expanded&&!currentId&&week.id===initialSelected;
      const value=empty(week)&&!current;
      week.classList.toggle('dg-empty-week',value);if(value)emptyIds.add(week.id);
      week.classList.toggle('dg-current-week',current);week.classList.toggle('dg-selected-week',selected);
      const heading=week.querySelector('.sectionname');let mark=heading?.querySelector('.dg-week-mark');
      if(current||selected){
        if(!mark&&heading){mark=document.createElement('span');mark.className='dg-week-mark';heading.append(mark);}
        const label=current?'이번 주':'선택됨';if(mark&&mark.textContent!==label)mark.textContent=label;
        if(mark)mark.title=current?'학사 기간과 한국 날짜 기준':'사이트에서 처음 선택된 주차 · 학사 기간 확인 불가';
      }else mark?.remove();
    }
    for(const tab of nav.children){tab.classList.toggle('dg-empty-week',emptyIds.has(tab.id));tab.classList.toggle('dg-current-week',tab.id===currentId);}
    root.classList.toggle('dg-hide-empty',hideEmpty);
    root.dataset.dgWeekLayout=layout;
    for(const option of layoutButtons)option.setAttribute('aria-pressed',String(option.dataset.layout===layout));
    button.setAttribute('aria-pressed',String(hideEmpty));
    button.textContent=hideEmpty?'빈 주차 다시 표시':'빈 주차 숨기기';
    summary.textContent=hideEmpty?`빈 주차 ${emptyIds.size}개 숨김`:`전체 ${weeks.length}주차`;
    loadCalendar();
  }
  const apply=value=>{root.classList.toggle('dg-all-weeks',value===true);update();};
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes.hideEmptyWeeks){hideEmpty=changes.hideEmptyWeeks.newValue===true;update();}
    if(changes.weekLayout){layout=layouts.has(changes.weekLayout.newValue)?changes.weekLayout.newValue:'1';update();}
    if(changes.allWeeks){revision++;apply(changes.allWeeks.newValue);}
  });
  const initialRevision=revision;
  chrome.storage.local.get(['allWeeks','hideEmptyWeeks','weekLayout']).then(data=>{
    if(revision===initialRevision){hideEmpty=data.hideEmptyWeeks===true;layout=layouts.has(data.weekLayout)?data.weekLayout:'1';apply(data.allWeeks);}
  }).catch(()=>apply(false));
  const refreshCalendar=()=>{
    if(document.hidden||!root.classList.contains('dg-all-weeks'))return;
    if(!calendarDoc&&Date.now()-calendarAttemptAt>=60000)calendarAttempts=0;
    update();
  };
  document.addEventListener('visibilitychange',refreshCalendar);
  document.defaultView?.addEventListener('pageshow',refreshCalendar);
  document.defaultView?.addEventListener('online',()=>{calendarAttempts=0;refreshCalendar();});
  if(typeof setInterval==='function')setInterval(refreshCalendar,60000)?.unref?.();
  new MutationObserver(records=>{
    if(records.some(record=>!record.target.closest?.('#dg-week-tools')))update();
  }).observe(document.querySelector('.course-content')||document.body,{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    if(!root.classList.contains('dg-all-weeks')||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest?.('.course-content .section_tab a[href^="#section-"]');
    if(!link)return;
    const id=link.getAttribute('href').slice(1);
    // The original page has duplicate IDs in the navigation and content.
    const section=[...document.querySelectorAll('.course-content ul.flexsections-level-1 > li.section')].find(el=>el.id===id);
    if(!section)return;
    event.preventDefault();event.stopImmediatePropagation();
    section.scrollIntoView({block:'start',behavior:'auto'});
  },true);
})();
