import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import {NewsRunBudget, NewsRunError, readBoundedText, stopCode} from './run_limits.mjs';

const source = readFileSync(new URL('collect_news.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').split('\nmain().catch(')[0];
const workflow = readFileSync(new URL('../../.github/workflows/collect-time-map-news.yml', import.meta.url), 'utf8');
const categories = ['politicsSociety', 'economyBusiness', 'scienceTechnology', 'globalHealth',
  'climateDisaster', 'cultureEntertainment', 'urbanDevelopment', 'sports', 'space'];
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
  topicIds: ['spaceDevelopment'], sourceIndexes: [0], existingEventId: '', newsStatus: 'resolved'}]};

function harness({env = {}, mode = 'success'} = {}) {
  const catalogPath = '/synthetic/cdx_time_map/catalog/news_events.json';
  const manifestPath = '/synthetic/cdx_time_map/catalog/news_events_manifest.json';
  const originalCatalog = JSON.stringify(existing);
  const originalManifest = '{"revision":"1.0.0"}';
  const files = new Map([[catalogPath, originalCatalog], [manifestPath, originalManifest]]);
  const logs = [];
  const requests = [];
  let rssCalls = 0;
  const context = vm.createContext({path, createHash, URL, Buffer, structuredClone,
    NewsRunBudget, NewsRunError, readBoundedText, stopCode,
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

test('normal two-Luna collection publishes matching bilingual catalog/manifest and safe usage report', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests.map((r) => r.model), ['gpt-6-luna', 'gpt-6-luna']);
  const catalog = JSON.parse(h.files.get('/synthetic/cdx_time_map/catalog/news_events.json'));
  const manifest = JSON.parse(h.files.get('/synthetic/cdx_time_map/catalog/news_events_manifest.json'));
  assert.equal(catalog.catalogVersion, manifest.revision);
  assert.equal(catalog.events[0].titleTranslations.en, 'New observation');
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
