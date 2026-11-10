fetch('CHANGELOG.md').then(response=>{
  if(!response.ok)throw Error('업데이트 내역을 불러오지 못했습니다.');
  return response.text();
}).then(text=>{
  const root=document.getElementById('history');root.replaceChildren();let list=null;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()){list=null;continue;}
    if(line.startsWith('- ')){
      if(!list){list=document.createElement('ul');root.append(list);}
      const item=document.createElement('li');item.textContent=line.slice(2);list.append(item);continue;
    }
    list=null;const level=line.startsWith('## ')?2:line.startsWith('# ')?1:0;
    const el=document.createElement(level?'h'+level:'p');el.textContent=level?line.slice(level+1):line;root.append(el);
  }
}).catch(error=>document.getElementById('history').textContent=error.message);
