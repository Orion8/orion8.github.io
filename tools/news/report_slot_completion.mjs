import {readFile} from 'node:fs/promises';
import {requestSlotClaim} from './news_slot_guard.mjs';

export async function reportSlotCompletion({
  env = process.env,
  read = readFile,
  send = requestSlotClaim,
} = {}) {
  const outcome = env.NEWS_CATALOG_OUTCOME;
  if (env.NEWS_EXECUTION_MODE !== 'guarded' || env.NEWS_DRY_RUN === '1' ||
      env.NEWS_ADMISSION !== 'claimed' || !['published','no_change'].includes(outcome)) {
    throw new Error('receipt_not_eligible');
  }
  const {revision} = JSON.parse(await read('cdx_time_map/catalog/news_events_manifest.json', 'utf8'));
  if (typeof revision !== 'string' || !/^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}$/.test(revision)) {
    throw new Error('receipt_invalid_revision');
  }
  const status = await send({env, slot: env.NEWS_SLOT_ID, receipt: {outcome, revision}});
  if (status !== 201) throw new Error('receipt_not_recorded');
}
