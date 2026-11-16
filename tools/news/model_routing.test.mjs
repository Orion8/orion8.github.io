import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

function scriptContext(name, result) {
  const requests = [];
  // Exercise actual request builders without executing their publishing main().
  const source = readFileSync(new URL(name, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').split('\nmain().catch(')[0];
  const context = vm.createContext({
    path, createHash, console, URL,
    process: {cwd: () => '/synthetic', env: {OPENAI_API_KEY: 'synthetic-key'}},
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({output: [{type: 'reasoning'}, {type: 'message', content: [
        {type: 'output_text', text: JSON.stringify(result)},
      ]}]});
    },
  });
  vm.runInContext(source, context);
  return {context, requests};
}

test('RSS triage defaults to Luna and keeps category selection validation', async () => {
  const categories = ['politicsSociety', 'economyBusiness', 'scienceTechnology',
    'globalHealth', 'climateDisaster', 'cultureEntertainment', 'urbanDevelopment', 'sports', 'space'];
  const draft = {articleIndexesByCategory: Object.fromEntries(categories.map((c) => [c, c === 'space' ? [0] : []]))};
  const f = scriptContext('collect_news.mjs', draft);
  const output = await vm.runInContext("triageWithOpenAI([{defaultCategory: 'space', title: 'Synthetic launch'}])", f.context);
  assert.deepEqual(Array.from(output.articleIndexes), [0]);
  assert.equal(f.requests[0].model, 'gpt-6-luna');
  assert.equal(f.requests[0].text.format.strict, true);
});

test('final news editing defaults to Luna with structured bilingual event output', async () => {
  const f = scriptContext('collect_news.mjs', {events: []});
  await vm.runInContext('organizeWithOpenAI({candidates: [], existingEvents: []})', f.context);
  const request = f.requests[0];
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
  assert.match(request.input[0].content, /titleEn and descriptionEn/);
});

test('catalog translation defaults to Luna and parses typed Responses output', async () => {
  const f = scriptContext('backfill_catalog_translations.mjs', {translations: []});
  await vm.runInContext("requestStructuredOutput({name: 'synthetic', schema: {type: 'object'}, input: {events: []}})", f.context);
  assert.equal(f.requests[0].model, 'gpt-6-luna');
  assert.equal(f.requests[0].text.format.strict, true);
});

test('publication rejects missing or blank content in either language', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../cdx_time_map/catalog/news_events.json', import.meta.url)));
  assert.ok(catalog.events.length > 0);
  const f = scriptContext('collect_news.mjs', {});
  vm.runInContext(`validateCatalog(${JSON.stringify(catalog)})`, f.context);
  for (const field of ['title', 'description', 'titleTranslations', 'descriptionTranslations']) {
    const broken = structuredClone(catalog);
    broken.events[0][field] = field.endsWith('Translations') ? {en: '  '} : '  ';
    assert.throws(() => vm.runInContext(`validateCatalog(${JSON.stringify(broken)})`, f.context), /invalid/);
  }
});

test('bilingual news updates retain identity and read-state key', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../cdx_time_map/catalog/news_events.json', import.meta.url)));
  const event = catalog.events[0];
  const candidate = {url: event.sourceUrl, sourceName: event.sourceName, publishedAt: event.startAt};
  const draft = {existingEventId: event.id, title: '한국어 제목', titleEn: 'English title',
    description: '한국어 설명', descriptionEn: 'English summary', startAt: event.startAt,
    category: event.category, importance: event.importance, topicIds: event.topicIds,
    sourceIndexes: [0], newsStatus: event.news.status};
  const f = scriptContext('collect_news.mjs', {});
  const result = vm.runInContext(`mergeEvents(${JSON.stringify({existingEvents: [event], candidates: [candidate], draftEvents: [draft]})})`, f.context)[0];
  assert.equal(result.id, event.id);
  assert.equal(result.startAt, event.startAt);
  assert.equal(result.sourceUrl, event.sourceUrl);
  assert.equal(result.importance, event.importance);
  assert.equal(result.titleTranslations.en, 'English title');
  assert.equal(result.descriptionTranslations.en, 'English summary');
  assert.deepEqual(Array.from(result.topicIds), event.topicIds);
});
