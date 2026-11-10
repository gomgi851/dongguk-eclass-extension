(() => {
  let revision=0,toggle=null;
  const apply=value=>{
    document.documentElement.classList.toggle('dg-site-dark',value===true);
    if(toggle){toggle.checked=value===true;toggle.closest('label').title=value?'사이트 다크 모드 끄기':'사이트 다크 모드 켜기';}
  };
  function mount(){
    const host=document.querySelector('#page-header .usermenu')||document.querySelector('#page-header');
    if(!host||document.getElementById('dg-site-theme'))return;
    const label=document.createElement('label');label.className='dg-site-theme-control';
    const text=document.createElement('span');text.textContent='다크 모드';
    toggle=document.createElement('input');toggle.type='checkbox';toggle.id='dg-site-theme';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','e-Class 사이트 다크 모드');
    const track=document.createElement('span');track.className='dg-site-theme-track';track.setAttribute('aria-hidden','true');
    label.append(text,toggle,track);host.prepend(label);
    apply(document.documentElement.classList.contains('dg-site-dark'));
    toggle.addEventListener('change',()=>{const value=toggle.checked;revision++;apply(value);chrome.storage.local.set({siteDark:value});});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.siteDark){revision++;apply(changes.siteDark.newValue);}
  });
  const initialRevision=revision;
  chrome.storage.local.get('siteDark').then(data=>{
    if(revision===initialRevision)apply(data.siteDark);
  }).catch(()=>apply(false));
})();
