import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import {NewsRunBudget, NewsRunError, readBoundedText, stopCode} from './run_limits.mjs';
import {admitNewsRun} from './news_slot_guard.mjs';

const source = readFileSync(new URL('collect_news.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').split('\nmain().catch(')[0];
const workflow = readFileSync(new URL('../../.github/workflows/collect-time-map-news.yml', import.meta.url), 'utf8');
const categories = ['politicsSociety', 'economyBusiness', 'scienceTechnology', 'globalHealth',
  'climateDisaster', 'cultureEntertainment', 'urbanDevelopment', 'sports', 'space', 'gamingEsports'];
const timestamp = new Date().toISOString();
const existing = {catalogVersion: '1.0.0', updatedAt: timestamp, sourceType: 'editorial', events: [{
  id: `news-${'a'.repeat(24)}`, title: '기존 관측', titleTranslations: {en: 'Existing observation'},
  description: '이미 발행된 뉴스', descriptionTranslations: {en: 'Previously published news'},
  startAt: new Date(Date.now() - 86400000).toISOString(), lane: 'world', category: 'space', importance: 2,
  sourceName: 'Synthetic source', sourceUrl: 'https://example.org/existing', topicIds: ['spaceDevelopment'],
  news: {status: 'resolved', sourceUrls: ['https://example.org/existing']},
}]};
const triage = {articleIndexesByCategory: Object.fromEntries(categories.map((c) => [c, c === 'space' ? [0] : []]))};
const draft = {events: [{title: '새 관측 결과', titleEn: 'New observation', description: '관측 결과가 발표됐다.',
  descriptionEn: 'Results were announced.', startAt: timestamp, category: 'space', importance: 2,
  changeSummary: '새 관측에서 고리의 존재를 확인했다.', changeSummaryEn: 'The new observation confirmed the rings.',
  topicIds: ['spaceDevelopment'], sourceIndexes: [0], existingEventId: '', newsStatus: 'resolved'}]};

function harness({env = {}, mode = 'success', guard} = {}) {
  const catalogPath = '/synthetic/cdx_time_map/catalog/news_events.json';
  const manifestPath = '/synthetic/cdx_time_map/catalog/news_events_manifest.json';
  const originalCatalog = JSON.stringify(existing);
  const originalManifest = '{"revision":"1.0.0"}';
  const files = new Map([[catalogPath, originalCatalog], [manifestPath, originalManifest]]);
  const logs = [];
  const requests = [];
  let rssCalls = 0;
  const context = vm.createContext({path, createHash, URL, Buffer, structuredClone,
    NewsRunBudget, NewsRunError, readBoundedText, stopCode, admitNewsRun,
    console: {log: (v) => logs.push(v), warn: (v) => logs.push(v)},
    process: {cwd: () => '/synthetic', env: {OPENAI_API_KEY: 'synthetic-secret', GITHUB_STEP_SUMMARY: '/summary', ...env}},
    readFile: async (name) => {
      if (name.endsWith('news_sources.json')) return JSON.stringify({sources: [{id: 'synthetic', name: 'Synthetic source',
        feedUrl: 'https://example.org/feed', topicIds: ['spaceDevelopment'], defaultCategory: 'space'}]});
      if (!files.has(name)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error; }
      return files.get(name);
    },
    mkdir: async () => {},
    writeFile: async (name, value) => files.set(name, value),
    fetch: async (url, options) => {
      if (String(url).startsWith('https://job.actions.githubusercontent.com/')) {
        assert.equal(options.headers.Authorization, 'Bearer synthetic-job-credential');
        assert.equal(options.redirect, 'error');
        assert.equal(url.searchParams.get('audience'), 'momentatlas-news-slot-guard:mnuyvyrhctsuwagtgtwl');
        return Response.json({value: 'synthetic.payload.signature'});
      }
      if (url === 'https://mnuyvyrhctsuwagtgtwl.supabase.co/functions/v1/news-slot-guard') {
        if (!guard) throw new Error('unexpected slot guard');
        return guard(JSON.parse(options.body), options);
      }
      if (url !== 'https://api.openai.com/v1/responses') {
        rssCalls++;
        if (mode === 'rss_failure') throw new Error('synthetic-secret');
        return new Response(`<rss><channel><item><title>New observation</title><link>https://example.org/new</link><pubDate>${timestamp}</pubDate><description>New verified results.</description></item></channel></rss>`);
      }
      const body = JSON.parse(options.body);
      requests.push(body);
      if (mode === 'http_failure') return Response.json({error: {message: 'synthetic-secret'}}, {status: 429});
      if (mode === 'timeout') return new Promise(() => {});
      const result = requests.length === 1 ? triage : (mode === 'invalid_draft' ? {events: [{title: 'bad'}]} : draft);
      return Response.json({status: mode === 'incomplete' ? 'incomplete' : 'completed',
        usage: mode === 'missing_usage' ? null : {input_tokens: 100, output_tokens: 50, total_tokens: 150},
        output_text: JSON.stringify(result)});
    },
  });
  vm.runInContext(source, context);
  return {context, files, logs, requests, get rssCalls() { return rssCalls; },
    run: () => vm.runInContext('main()', context),
    assertPreserved() {
      assert.equal(files.get(catalogPath), originalCatalog);
      assert.equal(files.get(manifestPath), originalManifest);
    },
  };
}

const guardedEnv = {
  NEWS_EXECUTION_MODE: 'guarded', NEWS_SLOT_ID: '2026-11-21/06:00',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://job.actions.githubusercontent.com/oidc',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-job-credential', GITHUB_RUN_ID: '110',
  GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
};

function guardFixture() {
  const slots = new Set();
  return (input, options) => {
    assert.equal(options.headers['x-momentatlas-news-identity'], 'synthetic.payload.signature');
    assert.equal(options.redirect, 'error');
    if (slots.has(input.slot)) return new Response(null, {status: 409});
    slots.add(input.slot);
    return new Response(null, {status: 201});
  };
}

test('simultaneous dispatches and later reruns cannot start a second paid pipeline', async () => {
  const guard = guardFixture();
  const first = harness({env: guardedEnv, guard});
  const second = harness({env: {...guardedEnv, GITHUB_RUN_ID: '111'}, guard});
  await Promise.all([first.run(), second.run()]);
  assert.deepEqual([first.requests.length, second.requests.length].sort(), [0, 2]);
  const skipped = first.requests.length === 0 ? first : second;
  assert.equal(skipped.rssCalls, 0);
  skipped.assertPreserved();
  assert.match(skipped.files.get('/summary'), /news_slot_already_claimed/);
  const rerun = harness({env: {...guardedEnv, GITHUB_RUN_ATTEMPT: '2'}, guard});
  await rerun.run();
  assert.equal(rerun.requests.length, 0);
  rerun.assertPreserved();
});

test('a lost AI response does not release the slot for the paid dry run or rerun', async () => {
  const guard = guardFixture();
  const first = harness({env: {...guardedEnv, NEWS_AI_TIMEOUT_MS: '10'}, mode: 'timeout', guard});
  await assert.rejects(first.run(), /ai_timeout/);
  assert.equal(first.requests.length, 1);
  assert.match(first.files.get('/summary'), /"unknownUsageCalls": 1/);
  const retry = harness({env: {...guardedEnv, NEWS_DRY_RUN: '1', GITHUB_RUN_ATTEMPT: '2'}, guard});
  await retry.run();
  assert.equal(retry.requests.length, 0);
  retry.assertPreserved();
});

test('no AI on unproven, unconfigured, or disallowed collection admission', async () => {
  for (const [env, status, code] of [
    [guardedEnv, 503, 'news_slot_guard_unavailable'],
    [guardedEnv, 200, 'news_slot_guard_unavailable'],
    [{...guardedEnv, ACTIONS_ID_TOKEN_REQUEST_TOKEN: ''}, 201, 'news_slot_guard_unavailable'],
    [{...guardedEnv, ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.org/oidc'}, 201, 'news_slot_guard_unavailable'],
    [{...guardedEnv, NEWS_SLOT_ID: ''}, 201, 'news_slot_required'],
    [{...guardedEnv, GITHUB_EVENT_NAME: 'schedule'}, 201, 'news_slot_required'],
    [{...guardedEnv, GITHUB_REF: 'refs/heads/feature'}, 201, 'news_slot_required'],
    [{...guardedEnv, NEWS_EXECUTION_MODE: ''}, 201, 'news_slot_guard_inactive'],
    [{GITHUB_RUN_ATTEMPT: '2'}, 201, 'news_legacy_rerun_blocked'],
  ]) {
    const h = harness({env, guard: () => new Response(null, {status})});
    await assert.rejects(h.run(), new RegExp(code));
    assert.equal(h.requests.length, 0);
    assert.equal(h.rssCalls, 0);
    h.assertPreserved();
    assert.equal(h.files.get('/summary').includes(guardedEnv.ACTIONS_ID_TOKEN_REQUEST_TOKEN), false);
  }
});

test('normal two-Luna collection publishes matching bilingual catalog/manifest and safe usage report', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests.map((r) => r.model), ['gpt-6-luna', 'gpt-6-luna']);
  const catalog = JSON.parse(h.files.get('/synthetic/cdx_time_map/catalog/news_events.json'));
  const manifest = JSON.parse(h.files.get('/synthetic/cdx_time_map/catalog/news_events_manifest.json'));
  assert.equal(catalog.catalogVersion, manifest.revision);
  assert.equal(catalog.events[0].titleTranslations.en, 'New observation');
  assert.equal(catalog.events[0].newsChangeSummary, draft.events[0].changeSummary);
  assert.equal(catalog.events[0].newsChangeSummaryTranslations.en, draft.events[0].changeSummaryEn);
  assert.equal(catalog.events[1].id, existing.events[0].id);
  assert.match(h.files.get('/summary'), /"accountedTokens": 300/);
  assert.equal(h.logs.join('').includes('synthetic-secret'), false);
});

test('dry run validates both passes without writing either live catalog file', async () => {
  const h = harness({env: {NEWS_DRY_RUN: '1'}});
  await h.run();
  h.assertPreserved();
  assert.equal(h.requests.length, 2);
});

for (const [mode, env, expected] of [
  ['http_failure', {}, 'ai_http_error'], ['timeout', {NEWS_AI_TIMEOUT_MS: '10'}, 'ai_timeout'],
  ['incomplete', {}, 'ai_incomplete'], ['missing_usage', {}, 'usage_missing_or_invalid'],
  ['rss_failure', {}, 'rss_unavailable'], ['invalid_draft', {}, 'validation_or_publication_failed'],
  ['success', {NEWS_MAX_AI_CALLS: '1'}, 'call_limit'],
  ['success', {NEWS_MAX_RUN_TOKENS: '1000'}, 'token_limit'],
  ['success', {NEWS_MAX_AI_CALLS: '9'}, 'invalid_limits'],
]) {
  test(`${mode}/${expected}: keeps both original files and reports only safe codes`, async () => {
    const h = harness({mode, env});
    await assert.rejects(h.run());
    h.assertPreserved();
    assert.ok(h.files.get('/summary').includes(expected));
    assert.equal(h.files.get('/summary').includes('synthetic-secret'), false);
    assert.equal(h.logs.join('').includes('synthetic-secret'), false);
    assert.ok(h.requests.length <= 2);
    if (expected === 'invalid_limits') assert.equal(h.rssCalls, 0);
  });
}

test('context packing preserves candidate indexes and balances category omissions', () => {
  const h = harness();
  vm.runInContext(`
    process.env.NEWS_MAX_AI_INPUT_BYTES = '2500';
    const articles = Array.from({length: 12}, (_, i) => ({index: i,
      defaultCategory: i < 10 ? 'politicsSociety' : 'space', excerpt: 'x'.repeat(500)}));
    const request = {input: [{content: 'rules'}, {content: ''}]};
    const packed = fitRequestContext(request, {candidateArticles: articles}, 'triage');
    globalThis.packedIndexes = packed.candidateArticles.map((a) => a.index);
    budget().close();
  `, h.context);
  const indexes = Array.from(h.context.packedIndexes);
  assert.ok(indexes.includes(10));
  assert.ok(indexes.length < 12);
  assert.ok(indexes.every((i) => Number.isInteger(i) && i >= 0 && i < 12));
});

test('workflow has a job deadline, safe tests before paid work and success-gated publishing', () => {
  assert.match(workflow, /timeout-minutes: 12/);
  assert.match(workflow, /node --test tools\/news\/\*\.test\.mjs/);
  assert.match(workflow, /if: \$\{\{ success\(\) && !inputs.dry_run }}/);
  assert.match(workflow, /NEWS_MAX_AI_CALLS: '2'/);
});

test('authentication probe has no shared secret, no OpenAI key and disables the collector job', () => {
  const probe = workflow.split(/\n  probe_slot_guard:\n/)[1].split(/\n  collect:\n/)[0];
  assert.match(probe, /id-token: write/);
  assert.match(probe, /node tools\/news\/probe_slot_guard\.mjs/);
  assert.doesNotMatch(probe, /OPENAI_API_KEY|collect_news\.mjs|NEWS_SLOT_GUARD_TOKEN/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && !inputs\.probe_slot_auth/);
});
