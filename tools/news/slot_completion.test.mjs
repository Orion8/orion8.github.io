import test from 'node:test';
import assert from 'node:assert/strict';
import {reportSlotCompletion} from './report_slot_completion.mjs';

const env = {
  NEWS_EXECUTION_MODE: 'guarded', NEWS_ADMISSION: 'claimed',
  NEWS_SLOT_ID: '2026-11-21/06:00', NEWS_CATALOG_OUTCOME: 'published',
};
const read = async () => '{"revision":"1.0.2"}';

test('only eligible runs report the verified manifest revision and publication result', async () => {
  for (const outcome of ['published', 'no_change']) {
    let requests = 0;
    await reportSlotCompletion({env: {...env, NEWS_CATALOG_OUTCOME: outcome}, read,
      send: async (params) => {
        requests++;
        assert.equal(params.slot, env.NEWS_SLOT_ID);
        assert.deepEqual(params.receipt, {outcome, revision: '1.0.2'});
        return 201;
      }});
    assert.equal(requests, 1);
  }
});

test('legacy, duplicates, failed publication, and paid dry runs cannot produce receipts', async () => {
  for (const patch of [
    {NEWS_EXECUTION_MODE: 'legacy'}, {NEWS_ADMISSION: 'already_claimed'},
    {NEWS_CATALOG_OUTCOME: ''}, {NEWS_CATALOG_OUTCOME: 'skipped'}, {NEWS_DRY_RUN: '1'},
  ]) {
    let requests = 0;
    await assert.rejects(reportSlotCompletion({env: {...env,...patch}, read, send: async () => ++requests}), /receipt_not_eligible/);
    assert.equal(requests, 0);
  }
  await assert.rejects(reportSlotCompletion({env, read: async () => '{"revision":"broken"}',
    send: async () => assert.fail('bad manifest must not be sent')}), /receipt_invalid_revision/);
  let requests = 0;
  await assert.rejects(reportSlotCompletion({env, read, send: async () => {requests++;return 503;}}), /receipt_not_recorded/);
  assert.equal(requests, 1);
});
