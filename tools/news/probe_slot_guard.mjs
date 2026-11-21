import {requestSlotClaim} from './news_slot_guard.mjs';

// A well-formed but expired slot can only be rejected by the database RPC,
// after the Edge Function has validated the actual GitHub job identity.
try {
  const status = await requestSlotClaim({slot: '2020-01-01/06:00'});
  if (status !== 422) throw new Error();
  console.log('Slot guard: GitHub identity accepted, expired slot rejected by the database.');
} catch {
  console.error('Slot guard: authenticated database reachability was not verified.');
  process.exitCode = 1;
}
