import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {DOMParser} from 'linkedom';
const base='extension/';
for(const name of (await readdir(base)).filter(n=>n.endsWith('.html'))){
 const doc=new DOMParser().parseFromString(await readFile(base+name,'utf8'),'text/html');
 for(const element of doc.querySelectorAll('*')){
  for(const attribute of element.attributes){
   assert.ok(!/^on/i.test(attribute.name),`${name}: inline event attribute ${attribute.name}`);
   if(['href','src','action','formaction'].includes(attribute.name))assert.ok(!/^\s*javascript:/i.test(attribute.value),`${name}: executable URL`);
  }
 }
 for(const script of doc.querySelectorAll('script')){assert.ok(script.getAttribute('src'),`${name}: inline script`);assert.equal(script.textContent.trim(),'');}
}
for(const name of (await readdir(base)).filter(n=>n.endsWith('.js'))){
 const text=await readFile(base+name,'utf8');
 assert.ok(!/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/.test(text),`${name}: executable HTML/string sink`);
}
const doc=new DOMParser().parseFromString('<html><body><p id="runtime-version"></p><p id="csp-status"></p><p id="csp-details"></p></body></html>','text/html');
vm.runInNewContext(await readFile(base+'diagnostics.js','utf8'),{document:doc,chrome:{runtime:{getManifest:()=>({version:'0.7.1'})}},Intl,Date});
doc.dispatchEvent(new doc.defaultView.Event('DOMContentLoaded'));
assert.match(doc.getElementById('csp-status').textContent,/0건/);
const event=new doc.defaultView.Event('securitypolicyviolation');Object.assign(event,{effectiveDirective:'script-src-attr',sourceFile:'chrome-extension://test/dashboard.js?secret=private',lineNumber:13,disposition:'enforce'});doc.dispatchEvent(event);
assert.match(doc.getElementById('csp-status').textContent,/1건/);assert.equal(doc.getElementById('csp-details').textContent,'script-src-attr · dashboard.js:13');assert.ok(!doc.body.textContent.includes('private'));
console.log('PASS: packaged HTML has no inline handlers/scripts or javascript URLs; no executable HTML sinks; session diagnostics count CSP events without sensitive URLs');
