/* Pure DOM readers. No playback, submission, or completion-state writes. */
export const ORIGIN = 'https://eclass.dongguk.edu';
export const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
export function safeURL(raw, base = ORIGIN) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { const u = new URL(raw, base); return u.origin === ORIGIN && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
export function kstDate(raw) {
  const m = raw?.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  const iso = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${mi}:${s}+09:00`;
  const n = Date.parse(iso); return Number.isFinite(n) ? n : null;
}
export function courses(doc) {
  return [...doc.querySelectorAll('a.course-link')].map(a => ({
    name: text(a.querySelector('h3')), url: safeURL(a.getAttribute('href')),
    category: text(a.querySelector('.course-label'))
  })).filter(c => c.name && c.url && /\/course\/view\.php\?/.test(c.url));
}
export function moduleLinks(doc, type) {
  return [...doc.querySelectorAll('a[href]')].map(a=>safeURL(a.getAttribute('href')))
    .filter(u=>u && new URL(u).pathname === `/mod/${type}/index.php`);
}
export function activityCatalog(doc, course) {
  return [...doc.querySelectorAll('li.activity')].map(el => {
    const type = [...el.classList].find(c=>c.startsWith('modtype_'))?.slice(8);
    const titleEl = el.querySelector('.instancename');
    const title = titleEl?.cloneNode(true);
    title?.querySelectorAll('.accesshide').forEach(e=>e.remove());
    const dates = text(el.querySelector('.displayoptions')).split('~');
    const url=safeURL(el.querySelector('.activityinstance a[href]')?.getAttribute('href') || course.url);
    let week=null,session=null;
    for(let parent=el.parentElement;parent;parent=parent.parentElement){
      if(!parent.matches('li.section'))continue;
      const heading=text(parent.querySelector('.sectionname'));
      week??=Number(heading.match(/(\d+)\s*주차/)?.[1])||null;
      session??=Number(heading.match(/(\d+)\s*차시/)?.[1])||null;
    }
    return {type, title: text(title), url, moduleId:moduleId(url)||el.id?.match(/^module-(\d+)$/)?.[1]||null,week,session,
      start: kstDate(dates[0]), due: kstDate(dates[1]),
      restricted: el.matches('.isrestricted')||!!el.querySelector('.isrestricted,.availabilityinfo'),
      available: kstDate(text(el.querySelector('.availabilityinfo')))};
  }).filter(a=>a.title);
}
function moduleId(url){if(!url)return null;const u=new URL(url,ORIGIN);return /^\/mod\/[^/]+\/view\.php$/.test(u.pathname)?u.searchParams.get('id'):null;}
const unsupportedTypes=new Set(['econtents','scorm','h5pactivity','lti']);
export function unsupportedLearning(catalog,course){
  return catalog.filter(a=>unsupportedTypes.has(a.type)).map(a=>({kind:'동영상',title:a.title,course:course.name,url:a.url||course.url,
    due:a.due??null,start:a.available??a.start??null,state:'unknown',unsupported:true,materialType:a.type,
    evidence:`${a.type} 형식 · 출석 여부를 자동 확인할 수 없습니다. 학교에서 직접 확인하세요.`,source:'강의실 · 미지원 학습 자료'}));
}
export function assignments(doc, course) {
  const table = [...doc.querySelectorAll('table')].find(t=>text(t.querySelector('thead')).includes('종료 일시') && text(t.querySelector('thead')).includes('제출'));
  if (!table) return {items: [], recognized: false};
  const headers = [...table.querySelectorAll('thead th, thead td')].map(text);
  const dueCol = headers.indexOf('종료 일시'), statusCol = headers.indexOf('제출');
  if (dueCol < 0 || statusCol < 0) return {items: [], recognized: false};
  const items = [...table.querySelectorAll('tbody tr')].flatMap(row => {
    const link = row.querySelector('a[href*="/mod/assign/view.php"]');
    if (!link) return [];
    const cells = [...row.children], status = text(cells[statusCol]);
    const state = /^(제출 완료|제출완료|제출됨)$/.test(status) ? 'done' : /미제출|제출하지 않|초안|작성 중/.test(status) ? 'pending' : 'unknown';
    return [{kind:'과제', title:text(link), course:course.name, url:safeURL(link.getAttribute('href')), due:kstDate(text(cells[dueCol])), start:null, state, evidence:status || '제출 상태 없음', source:'과제 목록'}];
  });
  return {items, recognized:true};
}
export function progress(doc, course, catalog, now = Date.now()) {
  const table = doc.querySelector('table.user_progress_table');
  if (!table || !text(table.querySelector('thead')).includes('출석인정 요구시간')) return {items:[], recognized:false};
  const items = [],unsupported=[];
  let week=null,session=null;
  // Locate the material cell by its image, so week/session rowspans do not shift columns.
  for (const row of table.querySelectorAll('tbody tr')) {
    const cells = [...row.children];
    const index = cells.findIndex(c=>c.querySelector('img'));
    if (index < 0) continue;
    const material = cells[index], img = material.querySelector('img');
    const prefix=cells.slice(0,index).map(text).join(' '),rowWeek=Number(prefix.match(/(\d+)\s*주차/)?.[1])||null;
    if(rowWeek&&rowWeek!==week){week=rowWeek;session=null;}
    session=Number(prefix.match(/(\d+)\s*차시/)?.[1])||session;
    const icon=img.getAttribute('src')||'',rowURL=safeURL(material.querySelector('a[href]')?.getAttribute('href'));
    const type=icon.match(/\/(vod|econtents|scorm|h5pactivity|lti)\//)?.[1];
    if(type&&unsupportedTypes.has(type)){
      const title=text(material),matches=catalog.filter(a=>a.type===type&&a.title===title);
      unsupported.push({type,title,url:rowURL||(matches.length===1?matches[0].url:null)});continue;
    }
    if (type!=='vod') continue;
    const title = text(material);
    const id=moduleId(rowURL);
    let candidates = catalog.filter(a=>a.type==='vod'&&(id?String(a.moduleId||moduleId(a.url))===id:a.title===title));
    if(!id&&candidates.length>1&&week)candidates=candidates.filter(a=>a.week===week);
    if(!id&&candidates.length>1&&session)candidates=candidates.filter(a=>a.session===session);
    const match = candidates.length === 1 ? candidates[0] : null;
    const learnedCell = cells[index+2]?.cloneNode(true);
    learnedCell?.querySelectorAll('button').forEach(e=>e.remove());
    const learned = text(learnedCell);
    const attendance = text(cells[index+3]);
    const detail = cells[index+2]?.querySelector('[data-eterm]');
    const epoch = Number(detail?.getAttribute('data-eterm'));
    const due = epoch > 0 ? epoch*1000 : match?.due ?? null;
    const start = match?.available ?? match?.start ?? null;
    const state = /^[O○]$/.test(attendance) ? 'done' : attendance === '▲' ? 'late' :
      start && start > now ? 'upcoming' : attendance === 'X' || (learned === '-' && match && !match.restricted) ? 'pending' : 'unknown';
    items.push({kind:'동영상', title, course:course.name, url:rowURL||match?.url || course.url, due, start, state,
      requiredSeconds:durationSeconds(text(cells[index+1])),learnedSeconds:learned==='-'?0:durationSeconds(learned),
      evidence:`출석 ${attendance || '미표시'} · 요구 ${text(cells[index+1])} · 학습 ${learned || '미표시'}`,
      source:'동영상 출석부 (주차 출석과 별도)'});
  }
  return {items, unsupported, recognized:true};
}
export function durationSeconds(value){
  if(!/^\d+:\d{2}(?::\d{2})?$/.test(value||''))return null;
  const parts=value.split(':').map(Number);
  if(parts.slice(1).some(n=>n>59))return null;
  return parts.reduce((total,n)=>total*60+n,0);
}
export function phase(item, now = Date.now()) {
  if (item.stale) return 'unknown';
  if (item.state === 'done' || item.state === 'late') return 'done';
  if (item.state === 'unknown') return 'unknown';
  if (item.state === 'upcoming' || item.start > now) return 'upcoming';
  if (item.due && item.due < now) return 'expired';
  return 'pending';
}
