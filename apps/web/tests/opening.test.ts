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
  resolveEvents,
} from "../src/game/engine";
import { damageBuildings, ensureHazard, profile } from "../src/game/disasters";
import { areaStatus, worldLayers } from "../src/game/worldRender";
import { eventLoss, productionPenalty } from "../src/game/disasters";
import { hazardPaint } from "../src/game/hazardVisuals";
import { EVENTS, RISK } from "../src/game/content";
import { RESOURCES } from "../src/game/types";
import { CIV_IDS } from "../src/game/types";

test("every civilization and seed begins with one gentle shower across all four areas", () => {
  for (const player of CIV_IDS)
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(player, "solo", seed);
      assert.deepEqual(
        CIV_IDS.filter((c) => !s.events[c].quiet),
        [...CIV_IDS],
      );
      assert.equal(
        areaStatus(s).filter((a) => a.effects.has("light_rain")).length,
        4,
      );
      assert.equal(new Set(Object.values(s.events).map((e) => e.type)).size, 1);
      assert(areaStatus(s).every((a) => a.damaged === 0));
      assert.equal(s.events[player].type, "light_rain");
      assert(Object.values(s.events[player].loss).every((n) => n <= 1));
      assert.equal(s.scheduled?.length, 0);
    }
});

test("the first three decades stay mild without major disasters or destruction", () => {
  const s = createGame();
  for (let round = 1; round <= 3; round++) {
    s.round = round;
    rollEvents(s);
    assert.equal(
      CIV_IDS.filter((c) => !s.events[c].quiet).length,
      [4, 4, 3][round - 1],
    );
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

test("every hot-seat player gets a response to the shared shower", () => {
  let s = advance(createGame("enclave", "hotseat", 12));
  for (const civ of CIV_IDS) {
    const q = questionFor(s, civ)!;
    s = answerQuiz(s, civ, q.correct, 1000);
  }
  assert.equal(s.phase, "response");
  for (const civ of CIV_IDS)
    s = applyAction(s, { type: "acknowledge", civ }).state;
  assert.equal(s.phase, "choice");
  for (const civ of CIV_IDS)
    s = applyAction(s, { type: "choose", civ, option: 2 }).state;
  assert.equal(s.phase, "build");
  for (const civ of CIV_IDS) {
    assert.equal(s.civs[civ].ready, false);
    assert.equal(s.civs[civ].hazards?.[0].type, "light_rain");
  }
  for (const civ of CIV_IDS) s = applyAction(s, { type: "ready", civ }).state;
  assert.equal(s.round, 2);
  assert(
    CIV_IDS.every(
      (c) => !s.civs[c].hazards?.some((h) => h.type === "light_rain"),
    ),
  );
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

test("rain causes no losses even for old saves and never reduces production", () => {
  const s = createGame();
  for (const civ of CIV_IDS) {
    const ev = s.events[civ];
    ev.loss = { wheat: 1 }; // An existing save from before rain became beneficial.
    assert.deepEqual(eventLoss(s, civ, ev, 2, false), {});
    const h = ensureHazard(s, civ, ev);
    assert.equal(h.remaining, 1);
    for (const resource of RESOURCES)
      assert.equal(productionPenalty(s.civs[civ], resource), 0);
    s.civs[civ].quiz = { questionId: "test", option: 0, correct: true };
    assert.deepEqual(eventLoss(s, civ, ev, 2), {});
  }
  assert.deepEqual(EVENTS.light_rain.cheap.cost, {});
  assert.deepEqual(EVENTS.light_rain.green.cost, { wood: 1 });
  assert.equal(RISK.destruction.light_rain.cap, 0);
});

test("rain rewards every town regardless of response or quiz outcome, without spillover", () => {
  for (const choice of [0, 1, 2] as const)
    for (const correct of [false, true]) {
      const s = createGame();
      const climate = s.climate;
      const before = structuredClone(s.civs);
      for (const civ of CIV_IDS) {
        s.civs[civ].choice = choice;
        s.civs[civ].quiz = { questionId: "test", correct };
      }
      resolveEvents(s);
      for (const civ of CIV_IDS) {
        for (const resource of RESOURCES)
          assert.equal(
            s.civs[civ].stock[resource],
            before[civ].stock[resource] + (resource === "wheat" ? 1 : 0),
          );
        assert.equal(s.civs[civ].damageScars?.length ?? 0, 0);
        assert(s.civs[civ].report[0].includes("gained 1 wheat"));
      }
      assert.equal(s.climate, climate);
    }
});

test("decade two always brings every civilization one small, short-lived dry spell", () => {
  for (const player of CIV_IDS)
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(player, "solo", seed);
      s.round = 2;
      rollEvents(s);
      const before = structuredClone(s.civs);
      for (const civ of CIV_IDS) {
        assert.equal(s.events[civ].type, "short_dry_spell");
        assert.equal(s.events[civ].quiet, false);
        assert.deepEqual(eventLoss(s, civ, s.events[civ], 2, false), {
          wheat: 1,
        });
        s.civs[civ].choice = 2;
      }
      resolveEvents(s);
      for (const civ of CIV_IDS) {
        assert.equal(s.civs[civ].stock.wheat, before[civ].stock.wheat - 1);
        assert.deepEqual(s.civs[civ].buildings, before[civ].buildings);
        assert.equal(s.civs[civ].hazards?.[0].remaining, 1);
        for (const resource of RESOURCES)
          assert.equal(productionPenalty(s.civs[civ], resource), 0);
      }
    }
});

test("the custom shower paints sparse raindrops in every area without flood effects", () => {
  const s = createGame();
  const L = worldLayers();
  const paint = hazardPaint(L, areaStatus(s), 24, s.seed);
  const counts = [0, 0, 0, 0],
    totals = [0, 0, 0, 0];
  for (let i = 0; i < L.area.length; i++) {
    const a = L.area[i];
    if (a >= 4) continue;
    totals[a]++;
    if (paint.over[i * 4 + 3]) counts[a]++;
  }
  for (let a = 0; a < 4; a++) {
    assert(counts[a] > 0);
    assert(counts[a] / totals[a] < 0.02);
  }
});

test("the scripted shower never enters the later random disaster pool", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const s = createGame("heartland", "solo", seed);
    for (let round = 4; round <= 10; round++) {
      s.round = round;
      rollEvents(s);
      assert(Object.values(s.events).every((e) => !EVENTS[e.type].openingOnly));
    }
  }
});

test("drizzle has short falling streaks, independent timing, and deterministic world placement", () => {
  const s = createGame();
  const L = worldLayers(),
    status = areaStatus(s);
  const a = hazardPaint(L, status, 24, s.seed).over;
  assert.deepEqual(hazardPaint(L, status, 24, s.seed).over, a);
  assert.notDeepEqual(hazardPaint(L, status, 30, s.seed).over, a);
  assert.notDeepEqual(hazardPaint(L, status, 24, s.seed + 1).over, a);
  let adjacent = 0;
  for (let y = 1; y < 200; y++)
    for (let x = 1; x < 320; x++) {
      const i = y * 320 + x;
      if (a[i * 4 + 3] && (a[(i - 320) * 4 + 3] || a[(i - 321) * 4 + 3]))
        adjacent++;
    }
  assert(
    adjacent > 30,
    "rain should form falling streaks rather than isolated flickering dots",
  );
});
