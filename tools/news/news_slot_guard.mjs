import {NewsRunError} from './run_limits.mjs';

const guardUrl = 'https://mnuyvyrhctsuwagtgtwl.supabase.co/functions/v1/news-slot-guard';
const audience = 'momentatlas-news-slot-guard:mnuyvyrhctsuwagtgtwl';
const slotPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\/(06|18):00$/;

/// Must succeed before entering collection (including paid dry runs).
/// The legacy mode is transitional: it may not accept explicit slot requests.
export async function admitNewsRun({env = process.env, fetchImpl = fetch} = {}) {
  const mode = env.NEWS_EXECUTION_MODE || 'legacy';
  const slot = env.NEWS_SLOT_ID ?? '';
  if (mode === 'legacy') {
    if (slot) throw new NewsRunError('news_slot_guard_inactive');
    // GitHub retains run ID but increments attempt when an operator reruns it.
    // Don't guess that an earlier attempt was free just because it failed.
    if (env.GITHUB_RUN_ATTEMPT && env.GITHUB_RUN_ATTEMPT !== '1') {
      throw new NewsRunError('news_legacy_rerun_blocked');
    }
    return 'legacy';
  }
  if (mode !== 'guarded') throw new NewsRunError('invalid_news_slot_mode');
  const status = await requestSlotClaim({env, fetchImpl, slot});
  if (status === 201) return 'claimed';
  if (status === 409) return 'already_claimed';
  if (status === 422) throw new NewsRunError('invalid_news_slot');
  // No retry: even a lost response may have durably consumed the slot.
  throw new NewsRunError('news_slot_guard_unavailable');
}

export async function requestSlotClaim({env = process.env, fetchImpl = fetch, slot}) {
  if (!slotPattern.test(slot) || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      !/^[1-9][0-9]{0,17}$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new NewsRunError('news_slot_required');
  }
  try {
    const issuer = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (issuer.protocol !== 'https:' || issuer.port || issuer.username || issuer.password ||
        !issuer.hostname.endsWith('.actions.githubusercontent.com') || !requestToken) {
      throw new Error();
    }
    issuer.searchParams.set('audience', audience);
    const issued = await fetchImpl(issuer, {
      headers: {Authorization: `Bearer ${requestToken}`},
      redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (!issued.ok) {
      void issued.body?.cancel().catch(() => {});
      throw new Error();
    }
    const {value: token} = await issued.json();
    if (typeof token !== 'string' || token.length > 8192 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const res = await fetchImpl(guardUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: {'Content-Type': 'application/json', 'x-momentatlas-news-identity': token},
      body: JSON.stringify({slot, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT}),
    });
    // Only the pinned endpoint's explicit response codes grant permission.
    void res.body?.cancel().catch(() => {});
    return res.status;
  } catch {
    throw new NewsRunError('news_slot_guard_unavailable');
  }
}
