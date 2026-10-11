import assert from "node:assert/strict";
import test from "node:test";
import { DEBATE_FORMATS, formatClock } from "./debateFormats.js";

test("Lincoln-Douglas follows the standard speech order and times", () => {
  assert.deepEqual(
    DEBATE_FORMATS.ld.segments.map(({ shortLabel, seconds }) => [shortLabel, seconds]),
    [
      ["AC", 360],
      ["CX", 180],
      ["NC", 420],
      ["CX", 180],
      ["1AR", 240],
      ["NR", 360],
      ["2AR", 180],
    ]
  );
  assert.equal(DEBATE_FORMATS.ld.prepSeconds, 240);
});

test("Public Forum follows the standard speech and crossfire order", () => {
  assert.deepEqual(
    DEBATE_FORMATS.pf.segments.map(({ shortLabel, seconds }) => [shortLabel, seconds]),
    [
      ["Constructive", 240],
      ["Constructive", 240],
      ["Crossfire", 180],
      ["Rebuttal", 240],
      ["Rebuttal", 240],
      ["Crossfire", 180],
      ["Summary", 180],
      ["Summary", 180],
      ["Grand Crossfire", 180],
      ["Final Focus", 120],
      ["Final Focus", 120],
    ]
  );
  assert.equal(DEBATE_FORMATS.pf.prepSeconds, 180);
});

test("formats debate clocks as minutes and seconds", () => {
  assert.equal(formatClock(240), "4:00");
  assert.equal(formatClock(61), "1:01");
  assert.equal(formatClock(0), "0:00");
});
