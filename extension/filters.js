import {phase} from './parser.js';
export function isSubmitted(item){return item.state==='done'||item.state==='late';}
export function matchesSubmission(item,submission){
  if(submission==='all')return true;
  if(submission==='done')return isSubmitted(item);
  return item.state==='pending'||item.state==='upcoming';
}
export function matchesPeriod(item,period,now=Date.now()){
  if(period==='all')return true;
  if(period==='active')return !!item.due&&item.due>=now&&(!item.start||item.start<=now);
  return phase(item,now)===period;
}
export function visibleItems(items,{kind,submission,period,query='',now=Date.now()}){
  return items.filter(i=>i.kind===kind&&matchesSubmission(i,submission)&&
    matchesPeriod(i,period,now)&&
    `${i.course} ${i.title}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>(a.due??Infinity)-(b.due??Infinity));
}
export function deadlineRemaining(due,now=Date.now()){
  if(!due)return '';
  const delta=due-now;
  if(delta<=0)return '마감 지남';
  if(delta<60000)return '1분 미만';
  if(delta<3600000)return `${Math.ceil(delta/60000)}분 남음`;
  if(delta<86400000)return `${Math.ceil(delta/3600000)}시간 남음`;
  const day=t=>Math.floor((t+9*3600000)/86400000);
  return `D-${day(due)-day(now)}`;
}
