import {ORIGIN,courses as parseCourses,moduleLinks,activityCatalog,assignments,progress,safeURL,unsupportedLearning} from './parser.js';

export function findLink(doc,path){
  return [...doc.querySelectorAll('a[href]')].map(a=>safeURL(a.getAttribute('href'))).find(u=>u&&new URL(u).pathname===path);
}
export function identifyAccount(doc){
  // The dashboard displays the student number inside the account button.
  for(const button of doc.querySelectorAll('button')){
    const match=button.textContent.match(/\(\s*(\d{8,12})\s*\)/);
    if(match)return match[1];
  }
  return null;
}
export function retainedItems(previous,selected){
  return (previous.items||[]).filter(item=>selected.some(c=>item.courseUrl?item.courseUrl===c.url:item.course===c.name))
    .map(item=>({...item,checkedAt:item.checkedAt||previous.checkedAt||null,stale:true}));
}
export function replaceScope(items,course,kind,fresh,checkedAt){
  return items.filter(item=>!(item.kind===kind&&(item.courseUrl?item.courseUrl===course.url:item.course===course.name)))
    .concat(fresh.map(item=>({...item,courseUrl:course.url,checkedAt,stale:false})));
}
export async function scanCourses({selected,previous={},read,signal,now=Date.now,onUpdate=async()=>{},accountKey=null}){
  let items=retainedItems(previous,selected),completed=0,latestCheckedAt=previous.checkedAt||null;
  const warnings=[],failedScopes=[];
  const snapshot=()=>({items,warnings:[...warnings],failedScopes:[...failedScopes],coverageIncomplete:items.some(i=>i.state==='unknown'||i.unsupported),checkedAt:latestCheckedAt,accountKey});
  async function report(message){await onUpdate({snapshot:snapshot(),completed,total:selected.length,message});}
  function fail(course,kind,error){
    warnings.push(`${course.name} · ${kind}: ${error.message}`);
    failedScopes.push({courseUrl:course.url,kind,message:error.message});
  }
  async function scope(course,kind,fn){
    try{const fresh=await fn();latestCheckedAt=now();items=replaceScope(items,course,kind,fresh,latestCheckedAt);await report(`${completed+1}/${selected.length} · ${course.name}`);}
    catch(error){if(error.name==='AbortError'||error.code==='AUTH')throw error;fail(course,kind,error);}
  }
  let stopped=false,authExpired=false;
  try{
    for(const course of selected){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      await report(`${completed+1}/${selected.length} · ${course.name}`);
      try{
        const home=await read(course.url),catalog=activityCatalog(home,course);
        const unsupported=unsupportedLearning(catalog,course);
        await scope(course,'과제',async()=>{
          const url=moduleLinks(home,'assign')[0];
          if(!url)throw Error('목록 링크 없음');
          const result=assignments(await read(url),course);
          if(!result.recognized)throw Error('표 형식을 확인하지 못함');
          return result.items;
        });
        await scope(course,'동영상',async()=>{
          const attendance=findLink(home,'/local/ubattendance/attendance_book.php');
          if(!attendance)throw Error('출석부 링크 없음');
          const attendanceDoc=await read(attendance);
          const url=findLink(attendanceDoc,'/report/ubcompletion/progress.php');
          if(!url)throw Error('동영상 출석부 링크 없음');
          const result=progress(await read(url),course,catalog,now());
          if(!result.recognized)throw Error('출석부 형식을 확인하지 못함');
          unsupported.push(...unsupportedLearning(result.unsupported||[],course));
          return result.items;
        });
        const unique=new Map();
        for(const item of unsupported){
          const key=item.url!==course.url?item.url:`${item.materialType}:${item.title}`;
          if(!unique.has(key))unique.set(key,item);
        }
        if(unique.size){
          items=items.filter(i=>!(i.unsupported&&(i.courseUrl===course.url||(!i.courseUrl&&i.course===course.name))));
          items.push(...[...unique.values()].map(i=>({...i,courseUrl:course.url,checkedAt:now(),stale:false})));
          warnings.push(`${course.name} · 미지원 학습 자료 ${unique.size}개 · 출석 여부를 학교에서 직접 확인하세요.`);
        }
        const uncertain=items.filter(i=>i.courseUrl===course.url&&i.state==='unknown'&&!i.unsupported).length;
        if(uncertain)warnings.push(`${course.name} · 상태 판별 불가 ${uncertain}개 · 학교에서 직접 확인하세요.`);
      }catch(error){if(error.name==='AbortError'||error.code==='AUTH')throw error;fail(course,'강좌',error);}
      completed++;
    }
  }catch(error){
    if(error.code==='AUTH'){authExpired=true;warnings.unshift('로그인이 만료되었습니다. 로그인 후 다시 확인하세요.');}
    else if(error.name==='AbortError'){stopped=true;warnings.unshift('확인을 중지했습니다. 미확인 항목은 이전 결과입니다.');}
    else{warnings.unshift(error.message);stopped=true;}
  }
  const stale=items.filter(i=>i.stale).length;
  const unsupportedCount=items.filter(i=>i.unsupported).length;
  const unresolved=items.filter(i=>i.state==='unknown'||i.unsupported).length;
  const message=authExpired?'로그인이 필요합니다':stopped?'중지됨 · 이전 결과 유지':failedScopes.length?`일부 확인 실패${stale?' · 이전 결과 유지':''}`:unsupportedCount?`미지원 자료 ${unsupportedCount}개 · 직접 확인 필요`:unresolved?`확인 필요 ${unresolved}개 · 직접 확인하세요`:`${completed}개 강좌 확인 완료`;
  return {snapshot:{...snapshot(),fullyCheckedAt:!failedScopes.length&&!unresolved&&!stopped&&!authExpired?now():previous.fullyCheckedAt||null},completed,total:selected.length,message,authExpired,stopped,partial:!!failedScopes.length||!!unresolved||stopped||authExpired};
}
export {ORIGIN,parseCourses};
