import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {pacificSlots,newsCheck,databaseChecks,weatherCheck,reconcile,githubClient,notificationSelfTest} from './monitor.mjs';
const at=Date.parse;
const weatherFixture=()=>({observed_at:'2026-11-18T04:05:00Z',weather:{schema_version:1,enabled:true,enabled_at:'2026-11-18T01:00:00Z',windows:[
  {start:'2026-11-18T03:00:00Z',end:'2026-11-18T03:30:00Z',requests:10,cached:7,upstream:3,limited:0,busy:0,unavailable:0},
  {start:'2026-11-18T03:30:00Z',end:'2026-11-18T04:00:00Z',requests:10,cached:7,upstream:3,limited:0,busy:0,unavailable:0},
]}});
test('weather alerts only after repeated complete windows with sufficient samples',()=>{
  const now=at('2026-11-18T04:05:00Z'),s=weatherFixture();
  assert.equal(weatherCheck(s,now).code,'weather_healthy');
  s.weather.windows[0].unavailable=2;s.weather.windows[0].cached=5;
  assert.equal(weatherCheck(s,now).state,'pending');
  s.weather.windows[1].unavailable=2;s.weather.windows[1].cached=5;
  assert.equal(weatherCheck(s,now).code,'weather_repeated_unavailable');
  for(const w of s.weather.windows)Object.assign(w,{unavailable:0,cached:2,upstream:3,limited:3,busy:2});
  assert.equal(weatherCheck(s,now).code,'weather_repeated_rate_limit');
  s.weather.windows[0].requests=0;s.weather.windows[0].cached=0;s.weather.windows[0].upstream=0;s.weather.windows[0].limited=0;s.weather.windows[0].busy=0;
  assert.equal(weatherCheck(s,now).code,'weather_low_traffic');
});
test('weather warming/disabled/malformed data never pretend healthy or recovered',()=>{
  const now=at('2026-11-18T04:05:00Z'),s=weatherFixture();
  s.weather.enabled_at='2026-11-18T03:05:00Z';assert.equal(weatherCheck(s,now).code,'weather_warming_up');
  s.weather.enabled=false;assert.equal(weatherCheck(s,now).code,'weather_metrics_disabled');
  s.weather.enabled=true;s.weather.windows[0].cached=-1;assert.throws(()=>weatherCheck(s,now));
  assert.throws(()=>weatherCheck(weatherFixture(),now+10*60000));
  const duplicate=weatherFixture();duplicate.weather.windows[1]=duplicate.weather.windows[0];assert.throws(()=>weatherCheck(duplicate,now));
  assert.throws(()=>weatherCheck({},now));
});
test('Pacific local 06/18 slots follow winter, summer and both DST transitions',()=>{
  for(const [date,expected] of [
    ['2026-11-18T23:00:00Z','2026-11-18T14:00:00.000Z'],
    ['2026-07-18T23:00:00Z','2026-07-18T13:00:00.000Z'],
    ['2026-03-08T23:00:00Z','2026-03-08T13:00:00.000Z'],
    ['2026-11-01T23:00:00Z','2026-11-01T14:00:00.000Z'],
  ])assert.ok(pacificSlots(at(date)).map(t=>new Date(t).toISOString()).includes(expected));
});
test('news pending before first slot/deadline and missing after grace',()=>{
  const from='2026-11-18T00:42:00Z';
  assert.equal(newsCheck({runs:[],from,now:at('2026-11-18T03:29:00Z')}).state,'pending');
  assert.equal(newsCheck({runs:[],from,now:at('2026-11-18T03:31:00Z')}).code,'scheduled_attempt_missing');
});
test('a recent previous run does not hide a missing next slot',()=>{
  const runs=[{id:1,event:'schedule',status:'completed',conclusion:'success',created_at:'2026-11-18T02:01:00Z'}];
  assert.equal(newsCheck({runs,from:'2026-11-18T00:00:00Z',now:at('2026-11-18T16:00:00Z')}).state,'alert');
});
test('scheduled success recovers; manual success is not proof of scheduled execution',()=>{
  const args={from:'2026-11-18T00:00:00Z',now:at('2026-11-18T04:00:00Z')};
  const run={id:1,event:'schedule',status:'completed',conclusion:'success',created_at:'2026-11-18T02:01:00Z'};
  assert.equal(newsCheck({...args,runs:[run]}).state,'ok');
  assert.equal(newsCheck({...args,runs:[{...run,event:'workflow_dispatch'}]}).code,'scheduled_attempt_missing');
});
test('explicit failure/cancellation and stalled attempts alert, configuration drift alerts',()=>{
  const args={from:'2026-11-18T00:00:00Z',now:at('2026-11-18T04:00:00Z')};
  for(const conclusion of ['failure','cancelled','timed_out']){
    assert.equal(newsCheck({...args,runs:[{id:1,event:'schedule',status:'completed',conclusion,created_at:'2026-11-18T02:01:00Z'}]}).code,'attempt_failed');
  }
  assert.equal(newsCheck({...args,runs:[{event:'schedule',status:'queued',created_at:'2026-11-18T02:01:00Z'}]}).code,'attempt_stalled');
  assert.equal(newsCheck({...args,runs:[],scheduleMatches:false}).code,'schedule_changed');
  assert.throws(()=>newsCheck({...args,from:'invalid',runs:[]}));
});
const snapshot=(now)=>({schema_version:1,observed_at:new Date(now).toISOString(),cron_timezone:'GMT',cron_enabled:true,
  jobs:['retention','weather_cache','weather_metrics_cleanup'].map((key)=>({key,first_due:'2026-11-18T03:17:00Z',exists:true,active:true,enabled:true,schedule_matches:true,
    last_status:'unknown',last_start:null,last_end:null,audit_matches:false}))});
test('DB first-run guard, missed run, failed run, disabled job and maintenance are distinct',()=>{
  let now=at('2026-11-18T03:30:00Z');
  assert.equal(databaseChecks(snapshot(now),now)[0].state,'pending');
  now=at('2026-11-18T04:30:00Z');
  const s=snapshot(now);assert.equal(databaseChecks(s,now)[0].code,'scheduled_attempt_missing');
  s.jobs[0].last_start='2026-11-18T03:17:00Z';s.jobs[0].last_end='2026-11-18T03:17:01Z';s.jobs[0].last_status='failed';
  assert.equal(databaseChecks(s,now)[0].code,'attempt_failed');
  s.jobs[0].maintenance_until='2026-11-18T05:00:00Z';assert.equal(databaseChecks(s,now)[0].state,'paused');
  s.jobs[0].maintenance_until=null;s.jobs[0].enabled=false;assert.equal(databaseChecks(s,now)[0].code,'job_disabled');
});
test('cron success requires matching retention audit and current slot; stale snapshot rejected',()=>{
  const now=at('2026-11-18T04:30:00Z'),s=snapshot(now);
  for(const j of s.jobs)Object.assign(j,{last_start:'2026-11-18T03:17:00Z',last_end:'2026-11-18T03:17:01Z',last_status:'succeeded'});
  assert.equal(databaseChecks(s,now)[0].code,'audit_missing');
  s.jobs[0].audit_matches=true;assert.ok(databaseChecks(s,now).every(c=>c.state==='ok'));
  assert.throws(()=>databaseChecks(s,now+10*60000));
});
function fakeApi(){
  const issues=[];const calls=[];
  const api=async(method,route,body)=>{
    calls.push({method,route,body});
    if(method==='GET')return structuredClone(issues);
    if(method==='POST' && route==='/issues'){
      const issue={number:issues.length+1,state:'open',...body};issues.push(issue);return issue;
    }
    const number=Number(route.split('/')[2]);const issue=issues.find(i=>i.number===number);
    if(method==='PATCH')Object.assign(issue,body);
    return {};
  };return {api,issues,calls};
}
test('one incident is created, repeats are quiet, pending does not close, success closes and failure reopens',async()=>{
  const f=fakeApi(),now=at('2026-11-18T05:00:00Z');
  const bad={key:'news',state:'alert',code:'scheduled_attempt_missing'};
  const reference=await reconcile(f.api,[bad],now);
  assert.equal(reference.news,1);
  await reconcile(f.api,[bad],now+1);
  assert.equal(f.issues.length,1);assert.equal(f.calls.filter(c=>c.method==='POST' && c.route==='/issues').length,1);
  await reconcile(f.api,[{key:'news',state:'pending',code:'attempt_running'}],now+2);assert.equal(f.issues[0].state,'open');
  await reconcile(f.api,[{key:'news',state:'ok',code:'scheduled_success'}],now+3);assert.equal(f.issues[0].state,'closed');
  await reconcile(f.api,[bad],now+4);assert.equal(f.issues.length,1);assert.equal(f.issues[0].state,'open');
});
test('unrelated issues are untouched and arbitrary provider/credential text cannot be emitted',async()=>{
  const f=fakeApi();f.issues.push({number:5,state:'open',body:'Unrelated customer text'});
  await reconcile(f.api,[{key:'news',state:'ok',code:'scheduled_success'}],Date.now());
  assert.equal(f.issues[0].state,'open');
  await assert.rejects(reconcile(f.api,[{key:'news',state:'alert',code:'opaque-private-secret'}],Date.now()));
  assert.equal(f.calls.some(c=>(JSON.stringify(c.body)??'').includes('opaque-private-secret')),false);
});
test('GitHub errors never include provider body or supplied key',async()=>{
  const api=githubClient('synthetic-secret',async()=>Response.json({message:'synthetic-secret'},{status:403}));
  await assert.rejects(api('GET','/issues'),e=>e.message==='github_api');
});
test('self-test closes by returned ID even when list indexing never finds the new issue',async()=>{
  let stored;
  const api=async(method,route,body)=>{
    if(method==='GET' && route.includes('?'))return [];
    if(method==='POST' && route==='/issues'){stored={number:123,state:'open',...body};return structuredClone(stored);}
    if(method==='PATCH'){Object.assign(stored,body);return stored;}
    if(method==='GET')return structuredClone(stored);
    return {};
  };
  await notificationSelfTest(api,Date.now());
  assert.equal(stored.state,'closed');
});
test('trusted-main workflow has limited permissions and tests before reading secrets',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/monitor-time-map-automation.yml',import.meta.url),'utf8');
  const news=readFileSync(new URL('../../.github/workflows/collect-time-map-news.yml',import.meta.url),'utf8');
  assert.match(news,/cron: '0 6,18 \* \* \*'/);assert.match(news,/timezone: 'America\/Los_Angeles'/);
  assert.match(workflow,/ref: main/);assert.match(workflow,/contents: read/);assert.match(workflow,/issues: write/);
  assert.doesNotMatch(workflow,/service.role|SUPABASE_ACCESS_TOKEN|contents: write/i);
});
