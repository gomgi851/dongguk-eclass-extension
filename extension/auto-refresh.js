export const AUTO_ALARM='eclass-auto-refresh';
export function refreshMinutes(value){return [5,15,30,60].includes(value)?value:15;}
export function installAutoRefresh({startJob,beforeRun=async()=>{},api=chrome,now=Date.now}){
  let scheduling=Promise.resolve();
  function schedule(){
    scheduling=scheduling.catch(()=>{}).then(async()=>{
      const {autoRefresh=true,autoRefreshMinutes}=await api.storage.local.get(['autoRefresh','autoRefreshMinutes']);
      if(!autoRefresh){await api.alarms.clear(AUTO_ALARM);return;}
      const minutes=refreshMinutes(autoRefreshMinutes),alarm=await api.alarms.get(AUTO_ALARM);
      if(!alarm||alarm.periodInMinutes!==minutes)await api.alarms.create(AUTO_ALARM,{delayInMinutes:minutes,periodInMinutes:minutes});
    });
    return scheduling;
  }
  let checking=null;
  async function run(){
    if(checking)return checking;
    checking=(async()=>{
      await beforeRun();
      const data=await api.storage.local.get(['autoRefresh','autoRefreshMinutes','courseList','selectedUrls','job','autoRefreshAttemptAt']);
      if(data.autoRefresh===false||data.job?.status==='running')return;
      const selected=Array.isArray(data.selectedUrls)?data.selectedUrls:(data.courseList||[]).filter(c=>c.category==='교과').map(c=>c.url);
      if(!selected.length)return;
      const last=Math.max(data.autoRefreshAttemptAt||0,data.job?.mode==='scan'?data.job.startedAt||0:0);
      if(last&&now()-last<refreshMinutes(data.autoRefreshMinutes)*60000)return;
      await api.storage.local.set({autoRefreshAttemptAt:now()});
      await startJob({type:'job:start',mode:'scan',selectedUrls:selected,automatic:true});
    })().finally(()=>checking=null);
    return checking;
  }
  const quiet=promise=>promise.catch(()=>{});
  api.alarms.onAlarm.addListener(alarm=>{if(alarm.name===AUTO_ALARM)return quiet(run());});
  api.runtime.onInstalled.addListener(()=>quiet(schedule()));
  api.runtime.onStartup.addListener(()=>quiet(schedule().then(run)));
  api.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.autoRefresh||changes.autoRefreshMinutes))return quiet(schedule());});
  quiet(schedule());
  return {schedule,run};
}
