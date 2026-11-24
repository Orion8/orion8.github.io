import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const repo='Orion8/orion8.github.io';
const label='momentatlas-ops';
const jobKeys=['retention','weather_cache','weather_metrics_cleanup'];
const keys=new Set(['news',...jobKeys,'weather_service','database','configuration','self_test']);
const codes=new Set(['workflow_inactive','schedule_changed','attempt_failed','first_slot_or_grace',
  'scheduled_attempt_missing','attempt_stalled','attempt_running','scheduled_success','cron_configuration',
  'missing_monitor_registry','planned_maintenance','missing_job','job_disabled','audit_missing',
  'configuration_valid','news_observation_unavailable','endpoint_available','database_observation_unavailable',
  'synthetic_notification_test','synthetic_test_finished','monitor_auth_failed',
  'weather_observation_unavailable','weather_metrics_disabled','weather_warming_up',
  'weather_low_traffic','weather_repeated_unavailable','weather_repeated_rate_limit','weather_healthy',
  'slot_completed_published','slot_completed_no_change','slot_claim_missing',
  'slot_claim_incomplete','slot_claim_running','slot_observation_unavailable']);
const iso=(t)=>new Date(t).toISOString();
const time=(v)=>typeof v==='string' && Number.isFinite(Date.parse(v))?Date.parse(v):null;
const result=(key,state,code,extra={})=>({key,state,code,...extra});

export function pacificSlots(now) {
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
  const parts=(t)=>Object.fromEntries(format.formatToParts(new Date(t)).map(p=>[p.type,p.value]));
  const today=parts(now); const slots=[];
  for(let days=0;days<4;days++) {
    const date=new Date(Date.UTC(+today.year,+today.month-1,+today.day-days));
    for(const hour of [6,18])for(let offset=-14;offset<=14;offset++) {
      const t=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hour)+offset*3600000;
      const p=parts(t);
      if(+p.year===date.getUTCFullYear() && +p.month===date.getUTCMonth()+1 && +p.day===date.getUTCDate() && +p.hour===hour)slots.push(t);
    }
  }
  return slots.sort((a,b)=>a-b);
}

export function newsCheck({runs,from,now,workflowActive=true,scheduleMatches=true}) {
  const start=time(from); if(start===null)throw new Error('configuration');
  if(!workflowActive)return result('news','alert','workflow_inactive');
  if(!scheduleMatches)return result('news','alert','schedule_changed');
  const latest=runs.filter(r=>time(r.created_at)!==null && time(r.created_at)>=start &&
    !(r.event==='workflow_dispatch' && r.display_title==='News slot authentication probe (no AI)'))
    .sort((a,b)=>time(b.created_at)-time(a.created_at))[0];
  if(latest?.status==='completed' && ['failure','timed_out','cancelled','action_required','startup_failure'].includes(latest.conclusion)) {
    return result('news','alert','attempt_failed', {runId:Number.isSafeInteger(latest.id)?latest.id:null});
  }
  const due=pacificSlots(now).filter(t=>t>=start && t<=now-90*60000).at(-1);
  if(due===undefined)return result('news','pending','first_slot_or_grace');
  const attempt=runs.filter(r=>r.event==='schedule' && time(r.created_at)>=due)
    .sort((a,b)=>time(b.created_at)-time(a.created_at))[0];
  if(!attempt)return result('news','alert','scheduled_attempt_missing',{due:iso(due)});
  if(attempt.status!=='completed') {
    const age=now-time(attempt.created_at);
    return result('news',age>30*60000?'alert':'pending',age>30*60000?'attempt_stalled':'attempt_running');
  }
  return result('news',attempt.conclusion==='success'?'ok':'alert',attempt.conclusion==='success'?'scheduled_success':'attempt_failed');
}

export function guardedNewsCheck({snapshot,from,now}) {
  const start=time(from), observed=time(snapshot?.observed_at), records=snapshot?.news_slots;
  if(start===null || observed===null || Math.abs(now-observed)>5*60000 ||
    records?.schema_version!==1 || !Array.isArray(records.slots) || records.slots.length>16) {
    throw new Error('news_slot_schema');
  }
  const claims=new Map();
  for(const r of records.slots){
    const slot=time(r?.slot_at), claimed=time(r?.claimed_at), completed=time(r?.completed_at);
    if(slot===null || claimed===null || claimed<slot || claimed>observed || claims.has(slot)) {
      throw new Error('news_slot_schema');
    }
    if(r.completed_at===null){
      if(r.outcome!==null || r.catalog_revision!==null)throw new Error('news_slot_schema');
    }else if(completed===null || completed<claimed || completed>observed || completed-claimed>20*60000 ||
      !['published','no_change'].includes(r.outcome) ||
      typeof r.catalog_revision!=='string' || !/^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}$/.test(r.catalog_revision)) {
      throw new Error('news_slot_schema');
    }
    claims.set(slot,{claimed,completed,outcome:r.outcome});
  }
  const due=pacificSlots(now).filter(t=>t>=start && t<=now-90*60000).at(-1);
  if(due===undefined)return result('news','pending','first_slot_or_grace');
  const claim=claims.get(due), info={due:iso(due)};
  if(!claim)return result('news','alert','slot_claim_missing',info);
  if(claim.completed===null) {
    const late=now-claim.claimed>=20*60000;
    return result('news',late?'alert':'pending',late?'slot_claim_incomplete':'slot_claim_running',info);
  }
  return result('news','ok',claim.outcome==='published'?'slot_completed_published':'slot_completed_no_change',info);
}

export function databaseChecks(snapshot,now) {
  if(snapshot?.schema_version!==1 || !Array.isArray(snapshot.jobs) || time(snapshot.observed_at)===null || Math.abs(now-time(snapshot.observed_at))>5*60000)throw new Error('database_schema');
  if(!['GMT','UTC','Etc/UTC'].includes(snapshot.cron_timezone) || snapshot.cron_enabled!==true) {
    return jobKeys.map(k=>result(k,'alert','cron_configuration'));
  }
  return jobKeys.map(key=>{
    const j=snapshot.jobs.find(j=>j.key===key);
    if(!j || time(j.first_due)===null)return result(key,'alert','missing_monitor_registry');
    if(time(j.maintenance_until)>now)return result(key,'paused','planned_maintenance');
    if(j.exists!==true)return result(key,'alert','missing_job');
    if(j.active!==true || j.enabled!==true)return result(key,'alert','job_disabled');
    if(j.schedule_matches!==true)return result(key,'alert','schedule_changed');
    const first=time(j.first_due),last=time(j.last_start),end=time(j.last_end);
    if(last!==null && j.last_status==='failed')return result(key,'alert','attempt_failed');
    if(now<first+60*60000)return result(key,'pending','first_slot_or_grace');
    const due=first+Math.floor((now-60*60000-first)/86400000)*86400000;
    if(last===null || last<due)return result(key,'alert','scheduled_attempt_missing',{due:iso(due)});
    if(end===null)return result(key,now-last>10*60000?'alert':'pending',now-last>10*60000?'attempt_stalled':'attempt_running');
    if(j.last_status!=='succeeded')return result(key,'alert','attempt_failed');
    if(key==='retention' && j.audit_matches!==true)return result(key,'alert','audit_missing');
    return result(key,'ok','scheduled_success');
  });
}

export function weatherCheck(snapshot,now) {
  const w=snapshot?.weather;
  if(!w || w.schema_version!==1 || time(snapshot.observed_at)===null || Math.abs(now-time(snapshot.observed_at))>5*60000 ||
    !Array.isArray(w.windows) || w.windows.length!==2 || time(w.enabled_at)===null)throw new Error('weather_schema');
  if(w.enabled!==true)return result('weather_service','alert','weather_metrics_disabled');
  const windows=[...w.windows].sort((a,b)=>time(a.start)-time(b.start));
  const end=Math.floor(now/(30*60000))*30*60000;
  for(const [i,v] of windows.entries()) {
    if(time(v.start)!==end-(2-i)*30*60000 || time(v.end)!==end-(1-i)*30*60000 ||
      !['requests','cached','upstream','limited','busy','unavailable'].every(k=>Number.isSafeInteger(v[k]) && v[k]>=0) ||
      v.cached+v.limited+v.busy+v.unavailable>v.requests || v.upstream>v.requests ||
      v.cached+v.upstream+v.limited+v.busy+v.unavailable<v.requests)throw new Error('weather_schema');
  }
  // Require two complete post-install windows and a minimum sample in EACH.
  if(time(w.enabled_at)>time(windows[0].start))return result('weather_service','pending','weather_warming_up');
  if(windows.some(v=>v.requests<5))return result('weather_service','pending','weather_low_traffic');
  if(windows.every(v=>v.unavailable/v.requests>=0.2))return result('weather_service','alert','weather_repeated_unavailable');
  if(windows.every(v=>v.requests>=10 && (v.limited+v.busy)/v.requests>=0.5))return result('weather_service','alert','weather_repeated_rate_limit');
  // Mixed or one-window problems are not proof of recovery.
  if(windows.some(v=>v.unavailable/v.requests>=0.2 || (v.limited+v.busy)/v.requests>=0.5))return result('weather_service','pending','attempt_running');
  return result('weather_service','ok','weather_healthy');
}

export function githubClient(token,fetchImpl=fetch,repository=repo) {
  return async(method,route,body)=>{
    const r=await fetchImpl(`https://api.github.com/repos/${repository}${route}`,{method,
      signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok){await r.body?.cancel();throw new Error('github_api');}
    return r.status===204?null:r.json();
  };
}

export function newsReadClient(env,legacyApi,fetchImpl=fetch) {
  if(env.MOMENTATLAS_MONITOR_PRIVATE_NEWS!=='true')return legacyApi;
  if(!env.MOMENTATLAS_NEWS_READ_TOKEN)throw new Error('missing_news_read_token');
  const client=githubClient(env.MOMENTATLAS_NEWS_READ_TOKEN,fetchImpl,'Orion8/cdx_time_map');
  return (method,route)=>{
    if(method!=='GET')throw new Error('news_monitor_read_only');
    return client(method,route);
  };
}
export async function reconcile(api,checks,now) {
  const handled={};
  // Only our labelled, marker-bearing issues. Do not alter unrelated issues.
  let issues=[];
  for(let page=1;page<=3;page++){
    const batch=await api('GET',`/issues?state=all&labels=${label}&per_page=100&page=${page}`);
    if(!Array.isArray(batch))throw new Error('github_schema');
    issues.push(...batch); if(batch.length<100)break;
    if(page===3)throw new Error('history_limit');
  }
  for(const check of checks){
    if(!keys.has(check.key) || !codes.has(check.code) || !['ok','pending','paused','alert'].includes(check.state))throw new Error('invalid_check');
    if(check.state==='paused')continue;
    const marker=`<!-- momentatlas-ops:${check.key} -->`;
    const matched=issues.filter(i=>!i.pull_request && typeof i.body==='string' && i.body.startsWith(marker));
    const issue=matched.find(i=>i.state==='open')??matched[0];
    if(check.state==='alert'){
      const title=`[MomentAtlas ops${check.key==='self_test'?' TEST':''}] ${check.key}`;
      const body=`${marker}\nAutomatic operational alert.\n\nCheck: ${check.key}\nReason: ${check.code}\nObserved: ${iso(now)}\n${time(check.due)!==null?`Expected slot: ${iso(time(check.due))}\n`:''}\nNo user data, raw errors or credentials are included.\nSee [monitor runs](https://github.com/${repo}/actions/workflows/monitor-time-map-automation.yml).`;
      if(!issue){
        const created=await api('POST','/issues',{title,body,labels:[label],assignees:['Orion8']});
        issues.push(created);
        handled[check.key]=created.number;
      }else if(issue.state!=='open')await api('PATCH',`/issues/${issue.number}`,{state:'open',title,body});
      if(issue)handled[check.key]=issue.number;
    }else if(issue?.state==='open'){
      // Pending is not recovery: never close an incident just because history
      // could not yet establish a successful slot.
      if(check.state!=='ok')continue;
      await api('POST',`/issues/${issue.number}/comments`,{body:`Recovered at ${iso(now)}. Status: ${check.code}.`});
      await api('PATCH',`/issues/${issue.number}`,{state:'closed',state_reason:'completed'});
    }
  }
  return handled;
}

export async function notificationSelfTest(api,now){
  let known;
  try{known=await reconcile(api,[result('self_test','alert','synthetic_notification_test')],now);}
  finally{
    // Listing/search indexing may lag a create; returned issue ID is authoritative.
    if(Number.isSafeInteger(known?.self_test)){
      await api('POST',`/issues/${known.self_test}/comments`,{body:`Synthetic notification test finished at ${iso(Date.now())}. No real incident.`});
      await api('PATCH',`/issues/${known.self_test}`,{state:'closed',state_reason:'completed'});
      const confirmed=await api('GET',`/issues/${known.self_test}`);
      if(confirmed.state!=='closed')throw new Error('self_test_cleanup');
    }else{
      await reconcile(api,[result('self_test','ok','synthetic_test_finished')],Date.now());
      throw new Error('self_test_cleanup_unverified');
    }
  }
}

async function main(){
  const now=Date.now();const api=githubClient(process.env.GITHUB_TOKEN);
  let checks=[];
  const mode=process.env.TIME_MAP_NEWS_EXECUTION_MODE || 'legacy';
  let observeGuarded=false;
  const paused=time(process.env.TIME_MAP_MONITOR_PAUSED_UNTIL);
  if(process.env.TIME_MAP_MONITOR_PAUSED_UNTIL && paused===null)throw new Error('configuration');
  if(paused!==null && paused>now){console.log('Monitor paused for planned maintenance.');return;}
  try {
    const readNews=newsReadClient(process.env,api);
    const workflow=await readNews('GET','/actions/workflows/collect-time-map-news.yml');
    const file=await readNews('GET','/contents/.github/workflows/collect-time-map-news.yml?ref=main');
    const yaml=Buffer.from(file.content,'base64').toString('utf8');
    if(mode!=='legacy' && mode!=='guarded')throw new Error('configuration');
    if(mode==='guarded'){
      if(time(process.env.TIME_MAP_NEWS_GUARDED_FROM)===null)throw new Error('configuration');
      if(workflow.state!=='active')checks.push(result('news','alert','workflow_inactive'));
      else if(/^\s{2}schedule\s*:/m.test(yaml))checks.push(result('news','alert','schedule_changed'));
      else observeGuarded=true;
    }else{
      let runs=[];
      for(let page=1;page<=3;page++){
        const data=await readNews('GET',`/actions/workflows/collect-time-map-news.yml/runs?branch=main&per_page=100&page=${page}`);
        if(!Array.isArray(data.workflow_runs))throw new Error('github_schema');
        runs.push(...data.workflow_runs);
        if(data.workflow_runs.length<100 || data.workflow_runs.some(r=>time(r.created_at)!==null && time(r.created_at)<now-4*86400000))break;
        if(page===3)throw new Error('history_limit');
      }
      checks.push(newsCheck({runs,now,from:process.env.TIME_MAP_MONITOR_FROM,workflowActive:workflow.state==='active',
        scheduleMatches:/cron: ['"]0 6,18 \* \* \*['"]/.test(yaml) && /timezone: ['"]America\/Los_Angeles['"]/.test(yaml)}));
    }
    checks.push(result('configuration','ok','configuration_valid'));
  } catch {checks.push(result('configuration','alert','news_observation_unavailable'));}
  let databaseError='database_observation_unavailable';
  try{
    const token=process.env.MOMENTATLAS_MONITOR_TOKEN;
    if(!token || !/^[a-f0-9]{64}$/.test(token)){databaseError='monitor_auth_failed';throw new Error('configuration');}
    const r=await fetch('https://mnuyvyrhctsuwagtgtwl.supabase.co/rest/v1/rpc/momentatlas_monitor_health',{
      method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:'sb_publishable_a4ee8MA2tz_ZFUlLIH9MKQ_i15u2Mc4','Content-Type':'application/json'},body:JSON.stringify({p_token:token})});
    if(!r.ok){if([401,403].includes(r.status))databaseError='monitor_auth_failed';await r.body?.cancel();throw new Error('database_api');}
    const snapshot=await r.json();
    checks.push(...databaseChecks(snapshot,now),result('database','ok','endpoint_available'));
    if(observeGuarded){
      try {checks.push(guardedNewsCheck({snapshot,from:process.env.TIME_MAP_NEWS_GUARDED_FROM,now}));}
      catch {checks.push(result('news','alert','slot_observation_unavailable'));}
    }
    try {checks.push(weatherCheck(snapshot,now));}
    catch {checks.push(result('weather_service','alert','weather_observation_unavailable'));}
    // Sanitized aggregate counts only; never raw RPC output.
    const totals=snapshot.weather?.last_24h;
    const fields=['requests','cached','upstream','limited','busy','unavailable'];
    if(totals && fields.every(k=>Number.isSafeInteger(totals[k]) && totals[k]>=0)){
      const counts=Object.fromEntries(fields.map(k=>[k,totals[k]]));
      const report={...counts,cacheHitPercent:totals.requests?Math.round(1000*totals.cached/totals.requests)/10:null};
      console.log(JSON.stringify({weatherLast24h:report}));
      if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## Weather (last 24h, observed completions)\n\n\`\`\`json\n${JSON.stringify(report,null,2)}\n\`\`\`\n`);
    }
  }catch {
    checks.push(result('database','alert',databaseError));
    if(observeGuarded)checks.push(result('news','alert','slot_observation_unavailable'));
  }
  // Label creation is idempotent via lookup. It requires only issues:write.
  try {await api('GET',`/labels/${label}`);}catch{await api('POST','/labels',{name:label,color:'d97706',description:'MomentAtlas automation incidents (sanitized)'});}
  await reconcile(api,checks,now);
  if(process.env.MONITOR_SELF_TEST==='1')await notificationSelfTest(api,now);
  const summary=checks.map(({key,state,code,due})=>({key,state,code,...(due?{due}:{})}));
  console.log(JSON.stringify({observedAt:iso(now),checks:summary}));
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## MomentAtlas automation\n\n\`\`\`json\n${JSON.stringify(summary,null,2)}\n\`\`\`\n`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{
  console.error('Operational monitor could not complete; inspect its workflow status. No raw error was logged.');process.exitCode=1;
});
