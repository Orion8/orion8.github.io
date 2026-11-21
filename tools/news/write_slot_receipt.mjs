import {reportSlotCompletion} from './report_slot_completion.mjs';

try {
  await reportSlotCompletion();
  console.log('News slot completion receipt recorded.');
} catch {
  // Publishing can already have succeeded. Never rerun a paid workflow to
  // compensate for an unavailable completion write.
  console.error('News slot completion receipt was not confirmed; do not retry paid collection.');
  process.exitCode = 1;
}
