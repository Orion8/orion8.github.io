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
    path, createHash, console,
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
