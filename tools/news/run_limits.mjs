// No credentials, prompts, URLs or provider error bodies enter these reports.
export class NewsRunError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function stopCode(error) {
  return error instanceof NewsRunError ? error.code : 'validation_or_publication_failed';
}

function integer(env, name, fallback, min, max) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new NewsRunError('invalid_limits');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new NewsRunError('invalid_limits');
  }
  return value;
}

export class NewsRunBudget {
  constructor(env = process.env, {now = Date.now} = {}) {
    this.limits = Object.freeze({
      maxCalls: integer(env, 'NEWS_MAX_AI_CALLS', 2, 1, 2),
      maxTokens: integer(env, 'NEWS_MAX_RUN_TOKENS', 150000, 1000, 200000),
      maxInputBytes: integer(env, 'NEWS_MAX_AI_INPUT_BYTES', 100000, 1000, 120000),
      triageOutput: integer(env, 'NEWS_TRIAGE_MAX_OUTPUT_TOKENS', 2000, 256, 4000),
      editorOutput: integer(env, 'NEWS_EDITOR_MAX_OUTPUT_TOKENS', 12000, 1024, 16000),
      aiTimeoutMs: integer(env, 'NEWS_AI_TIMEOUT_MS', 90000, 10, 120000),
      rssTimeoutMs: integer(env, 'NEWS_RSS_TIMEOUT_MS', 12000, 10, 20000),
      runTimeoutMs: integer(env, 'NEWS_RUN_TIMEOUT_MS', 480000, 10, 540000),
    });
    this.now = now;
    this.startedAt = now();
    this.controller = new AbortController();
    this.timer = setTimeout(() => this.controller.abort(), this.limits.runTimeoutMs);
    this.timer.unref();
    this.calls = [];
    this.accountedTokens = 0;
  }

  check() {
    if (this.controller.signal.aborted || this.now() - this.startedAt >= this.limits.runTimeoutMs) {
      throw new NewsRunError('run_timeout');
    }
  }

  async timed(timeoutMs, operation, timeoutCode) {
    this.check();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, this.controller.signal]);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let abort;
    const aborted = new Promise((_, reject) => {
      abort = () => reject(new NewsRunError(this.controller.signal.aborted ? 'run_timeout' : timeoutCode));
      signal.addEventListener('abort', abort, {once: true});
      if (signal.aborted) abort();
    });
    try {
      const result = await Promise.race([Promise.resolve().then(() => operation(signal)), aborted]);
      this.check();
      return result;
    } catch (error) {
      if (signal.aborted) throw new NewsRunError(this.controller.signal.aborted ? 'run_timeout' : timeoutCode);
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  async request(body, stage, {fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY} = {}) {
    this.check();
    if (!['triage', 'editor'].includes(stage)) throw new NewsRunError('invalid_stage');
    if (this.calls.length >= this.limits.maxCalls) throw new NewsRunError('call_limit');
    const maxOutput = stage === 'triage' ? this.limits.triageOutput : this.limits.editorOutput;
    const requestBody = JSON.stringify({...body, max_output_tokens: maxOutput});
    const inputBytes = Buffer.byteLength(requestBody, 'utf8');
    if (inputBytes > this.limits.maxInputBytes) throw new NewsRunError('input_limit');
    // Conservative admission reservation, NOT an exact tokenizer/billing quote.
    // Count every UTF-8 byte plus framing margin; include maximum reasoning/output.
    const reservation = inputBytes + 4096 + maxOutput;
    if (this.accountedTokens + reservation > this.limits.maxTokens) throw new NewsRunError('token_limit');
    const call = {stage, reservedTokens: reservation, usage: null, status: 'attempted'};
    this.calls.push(call);
    this.accountedTokens += reservation;
    let payload;
    try {
      payload = await this.timed(this.limits.aiTimeoutMs, async (signal) => {
        const response = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST', signal,
          headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
          body: requestBody,
        });
        // Never log/copy provider errors; these may echo input or credentials.
        if (!response.ok) { await response.body?.cancel(); throw new NewsRunError('ai_http_error'); }
        try { return JSON.parse(await readBoundedText(response, 2000000)); }
        catch (error) { if (error instanceof NewsRunError) throw error; throw new NewsRunError('invalid_ai_json'); }
      }, 'ai_timeout');
      const usage = payload?.usage;
      if (!usage || ![usage.input_tokens, usage.output_tokens, usage.total_tokens].every((v) => Number.isSafeInteger(v) && v >= 0)
          || usage.total_tokens !== usage.input_tokens + usage.output_tokens) {
        throw new NewsRunError('usage_missing_or_invalid');
      }
      call.usage = {inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens};
      this.accountedTokens += usage.total_tokens - reservation;
      if (usage.output_tokens > maxOutput || usage.total_tokens > reservation || this.accountedTokens > this.limits.maxTokens) {
        throw new NewsRunError('token_limit');
      }
      if (payload.status !== 'completed' || payload.error || payload.incomplete_details) {
        throw new NewsRunError('ai_incomplete');
      }
      call.status = 'completed';
      return payload;
    } catch (error) {
      const safe = error instanceof NewsRunError ? error : new NewsRunError('ai_network_error');
      call.status = safe.code;
      throw safe;
    }
  }

  report(status, code = null) {
    return {status, stopCode: code, elapsedMs: Math.max(0, this.now() - this.startedAt),
      limits: this.limits, callsAttempted: this.calls.length,
      accountedTokens: this.accountedTokens,
      reportedInputTokens: this.calls.reduce((n, c) => n + (c.usage?.inputTokens ?? 0), 0),
      reportedOutputTokens: this.calls.reduce((n, c) => n + (c.usage?.outputTokens ?? 0), 0),
      unknownUsageCalls: this.calls.filter((c) => c.usage == null).length,
      calls: this.calls.map((c) => ({...c}))};
  }

  close() { clearTimeout(this.timer); }
}

export async function readBoundedText(response, maximumBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw new NewsRunError('response_size_limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    // On oversized/malformed streams, stop downloading the remaining body.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
