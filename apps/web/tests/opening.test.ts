import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame,
  rollEvents,
  advance,
  answerQuiz,
  applyAction,
  questionFor,
} from "../src/game/engine";
import { damageBuildings, ensureHazard, profile } from "../src/game/disasters";
import { areaStatus } from "../src/game/worldRender";
import { CIV_IDS } from "../src/game/types";

test("every civilization and seed begins with exactly one visible, mild disaster", () => {
  for (const player of CIV_IDS)
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(player, "solo", seed);
      assert.deepEqual(
        CIV_IDS.filter((c) => !s.events[c].quiet),
        [player],
      );
      assert.equal(areaStatus(s).filter((a) => a.effects.size > 0).length, 1);
      assert.equal(s.events[player].type, "flood");
      assert(Object.values(s.events[player].loss).every((n) => n <= 1));
      assert.equal(s.scheduled?.length, 0);
    }
});

test("opening pressures ramp from one to three towns without major disasters or destruction", () => {
  const s = createGame();
  for (let round = 1; round <= 3; round++) {
    s.round = round;
    rollEvents(s);
    assert.equal(CIV_IDS.filter((c) => !s.events[c].quiet).length, round);
    assert.equal(Object.keys(s.minorEvents ?? {}).length, 0);
    for (const c of CIV_IDS) {
      assert(!profile(s.events[c].type).major);
      s.civs[c].buildings = ["farm", "farm", "house", "lumber"];
      const h = ensureHazard(s, c, s.events[c]);
      assert.deepEqual(
        damageBuildings(s, c, h, 2, () => 0, 4),
        [],
      );
    }
  }
});

test("quiet hot-seat towns skip incident questions and responses while retaining build turns", () => {
  let s = advance(createGame("enclave", "hotseat", 12));
  const q = questionFor(s, "enclave")!;
  s = answerQuiz(s, "enclave", q.correct, 1000);
  assert.equal(s.phase, "response");
  s = applyAction(s, { type: "acknowledge", civ: "enclave" }).state;
  assert.equal(s.phase, "choice");
  s = applyAction(s, { type: "choose", civ: "enclave", option: 2 }).state;
  assert.equal(s.phase, "build");
  for (const c of CIV_IDS.filter((c) => c !== "enclave")) {
    assert.equal(s.civs[c].hazards?.length, 0);
    assert.equal(s.civs[c].ready, false);
  }
});

test("normal regional pressures resume after the third decade", () => {
  const s = createGame();
  s.round = 4;
  rollEvents(s);
  assert(CIV_IDS.every((c) => !s.events[c].quiet && s.minorEvents?.[c]));
});

test("map terrain and castle overlays share their scroll surface", () => {
  const source = readFileSync(
    new URL("../src/components/WorldMap.tsx", import.meta.url),
    "utf8",
  );
  const surface = source.indexOf('className="map-surface"');
  assert(surface > source.indexOf('className="map-viewport"'));
  assert(
    source.indexOf("<LiveTerrain", surface) < source.indexOf("<svg", surface),
  );
  assert(source.includes('className="castle-hotspot"'));
});
