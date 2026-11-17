import assert from 'node:assert/strict';
import test from 'node:test';
import {NewsRunBudget, NewsRunError, readBoundedText, stopCode} from './run_limits.mjs';

const body = {model: 'gpt-6-luna', input: [{role: 'user', content: 'Synthetic article'}]};
const completed = (overrides = {}) => Response.json({status: 'completed',
  usage: {input_tokens: 100, output_tokens: 50, total_tokens: 150},
  output_text: '{}', ...overrides});
function guard(t, env = {}, options) {
  const budget = new NewsRunBudget(env, options);
  t.after(() => budget.close());
  return budget;
}

test('validates limits before any request; rejects disabling/raising guard ceilings', () => {
  for (const env of [{NEWS_MAX_AI_CALLS: '3'}, {NEWS_MAX_AI_CALLS: '0'},
    {NEWS_MAX_RUN_TOKENS: 'NaN'}, {NEWS_AI_TIMEOUT_MS: '-1'},
    {NEWS_RUN_TIMEOUT_MS: 'Infinity'}, {NEWS_MAX_AI_INPUT_BYTES: '99999999'}]) {
    assert.throws(() => new NewsRunBudget(env), {code: 'invalid_limits'});
  }
});

test('sets distinct output caps, accounts usage and blocks a third call', async (t) => {
  const b = guard(t);
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    assert.equal(options.signal.aborted, false);
    return completed();
  };
  await b.request(body, 'triage', {fetchImpl, apiKey: 'synthetic-secret'});
  await b.request(body, 'editor', {fetchImpl, apiKey: 'synthetic-secret'});
  await assert.rejects(b.request(body, 'editor', {fetchImpl}), {code: 'call_limit'});
  assert.deepEqual(requests.map((r) => r.max_output_tokens), [2000, 12000]);
  assert.equal(b.report('completed').accountedTokens, 300);
  assert.equal(b.report('completed').reportedInputTokens, 200);
  assert.equal(b.report('completed').reportedOutputTokens, 100);
  assert.equal(requests.length, 2);
});

test('reserves input + maximum output before allowing another paid attempt', async (t) => {
  const b = guard(t, {NEWS_MAX_RUN_TOKENS: '7000'});
  let calls = 0;
  const fetchImpl = async () => { calls++; return completed({usage: {input_tokens: 5900, output_tokens: 100, total_tokens: 6000}}); };
  await b.request(body, 'triage', {fetchImpl});
  await assert.rejects(b.request(body, 'editor', {fetchImpl}), {code: 'token_limit'});
  assert.equal(calls, 1);
  assert.equal(b.report('failed').accountedTokens, 6000);
});

test('oversized input fails before a fetch and no truncation invents facts', async (t) => {
  const b = guard(t, {NEWS_MAX_AI_INPUT_BYTES: '1000'});
  await assert.rejects(b.request({...body, input: '가'.repeat(1000)}, 'triage', {
    fetchImpl: () => assert.fail('must not send oversized input'),
  }), {code: 'input_limit'});
  assert.equal(b.calls.length, 0);
});

for (const status of [401, 429, 500]) {
  test(`HTTP ${status} stops without retry and excludes provider error body`, async (t) => {
    const b = guard(t);
    let calls = 0;
    const secret = 'synthetic-credential-do-not-log';
    await assert.rejects(b.request(body, 'triage', {apiKey: secret, fetchImpl: async () => {
      calls++; return Response.json({error: {message: secret}}, {status});
    }}), {code: 'ai_http_error'});
    assert.equal(calls, 1);
    const report = JSON.stringify(b.report('failed', 'ai_http_error'));
    assert.equal(report.includes(secret), false);
    assert.equal(report.includes('Synthetic article'), false);
    assert.equal(b.report('failed').unknownUsageCalls, 1);
  });
}

test('hung request aborts promptly, retains unknown-usage reservation', async (t) => {
  const b = guard(t, {NEWS_AI_TIMEOUT_MS: '10'});
  let signal;
  await assert.rejects(b.request(body, 'triage', {fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }}), {code: 'ai_timeout'});
  assert.equal(signal.aborted, true);
  assert.equal(b.report('failed').unknownUsageCalls, 1);
  assert.ok(b.accountedTokens > 2000);
});

test('deadline includes a stalled response body, not just response headers', async (t) => {
  const b = guard(t, {NEWS_AI_TIMEOUT_MS: '10'});
  let cancelled = false;
  await assert.rejects(b.request(body, 'triage', {fetchImpl: async (_url, {signal}) => {
    const stream = new ReadableStream({start(controller) {
      signal.addEventListener('abort', () => { cancelled = true; controller.error(new Error('aborted')); }, {once: true});
    }});
    return new Response(stream);
  }}), {code: 'ai_timeout'});
  assert.equal(cancelled, true);
});

test('RSS timeout has no AI token charge and whole-run deadline is independent', async (t) => {
  const b = guard(t);
  await assert.rejects(b.timed(10, () => new Promise(() => {}), 'rss_timeout'), {code: 'rss_timeout'});
  assert.equal(b.accountedTokens, 0);
  let now = 0;
  const deadline = guard(t, {NEWS_RUN_TIMEOUT_MS: '10'}, {now: () => now});
  now = 11;
  await assert.rejects(deadline.request(body, 'triage', {
    fetchImpl: () => assert.fail('whole-run deadline passed'),
  }), {code: 'run_timeout'});
});

test('whole-run deadline aborts an active request before its own deadline', async (t) => {
  const b = guard(t, {NEWS_RUN_TIMEOUT_MS: '10', NEWS_AI_TIMEOUT_MS: '1000'});
  let signal;
  await assert.rejects(b.request(body, 'triage', {fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }}), {code: 'run_timeout'});
  assert.equal(signal.aborted, true);
});

for (const [name, overrides, code] of [
  ['missing usage', {usage: null}, 'usage_missing_or_invalid'],
  ['malformed usage', {usage: {input_tokens: 1, output_tokens: 2, total_tokens: 99}}, 'usage_missing_or_invalid'],
  ['incomplete with valid-looking JSON', {status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'}}, 'ai_incomplete'],
  ['over reported budget', {usage: {input_tokens: 200000, output_tokens: 50, total_tokens: 200050}}, 'token_limit'],
]) {
  test(`${name} rejects the response`, async (t) => {
    const b = guard(t);
    await assert.rejects(b.request(body, 'triage', {fetchImpl: async () => completed(overrides)}), {code});
  });
}

test('bounds streamed response size and never exports unknown exception text', async () => {
  await assert.rejects(readBoundedText(new Response('x'.repeat(100)), 10), {code: 'response_size_limit'});
  assert.equal(stopCode(new Error('opaque-secret')), 'validation_or_publication_failed');
  assert.equal(stopCode(new NewsRunError('ai_timeout')), 'ai_timeout');
});
