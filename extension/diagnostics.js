// Observe this popup session only. Keep CSP enforcement and browser error reporting intact.
(() => {
  let violations=0;
  const started=new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(Date.now());
  const details=[];
  function render(){
    const version=document.getElementById('runtime-version'),status=document.getElementById('csp-status'),list=document.getElementById('csp-details');
    if(version)version.textContent=`실행 버전 v${chrome.runtime.getManifest().version} · ${started} 시작`;
    if(status)status.textContent=`이번 팝업의 CSP 차단: ${violations}건`;
    if(list)list.textContent=details.join('\n');
  }
  document.addEventListener('securitypolicyviolation',event=>{
    if(event.disposition==='report')return;
    violations++;
    // Do not retain code samples, document URLs, tokens or personal data.
    const raw=(event.sourceFile||'').split(/[?#]/)[0].split('/').pop();
    const file=raw&&/^[a-z0-9_.-]+\.js$/i.test(raw)?raw:'출처 미상';
    details.push(`${event.effectiveDirective} · ${file}:${event.lineNumber||0}`);
    if(details.length>5)details.shift();
    render();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
