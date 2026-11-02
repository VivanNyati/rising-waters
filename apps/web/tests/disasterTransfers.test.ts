import test from "node:test";
import assert from "node:assert/strict";
import { createGame, resolveEvents } from "../src/game/engine";
import { disasterTransfers } from "../src/game/disasterTransfers";
import { CIV_IDS } from "../src/game/types";
import { EVENTS } from "../src/game/content";

test("transfer details match the disaster, actual receiver, choice and loss applied by the rules", () => {
  const s = createGame();
  s.round = 4;
  for (const civ of CIV_IDS) s.events[civ].quiet = true;
  s.events.heartland = { type: "flood", loss: {}, origin: "heartland" };
  s.civs.heartland.choice = 0;
  const before = s.civs.enclave.stock.wheat;
  resolveEvents(s);
  s.phase = "build";
  const [transfer] = disasterTransfers(s);
  assert.equal(disasterTransfers(s).length, 1);
  assert.equal(transfer.e.name, "River flood");
  assert.equal(transfer.to, "enclave");
  assert.match(transfer.source, /Frostpeak/);
  assert.match(transfer.destination, /Mossholm/);
  assert(transfer.why.includes(EVENTS.flood.cheap.label));
  assert.match(transfer.why, /downstream/);
  assert.match(transfer.impact, /1 wheat/);
  assert.equal(s.civs.enclave.stock.wheat, before - 1);
});

test("arrows exclude quiet events, sustainable choices and the gentle opening", () => {
  const s = createGame();
  s.phase = "build";
  for (const civ of CIV_IDS) s.civs[civ].choice = 0;
  assert.deepEqual(disasterTransfers(s), []);
  s.events.heartland = { type: "spill", loss: {} };
  s.civs.heartland.choice = 1;
  assert.deepEqual(disasterTransfers(s), []);
  s.civs.heartland.choice = 0;
  s.events.heartland.quiet = true;
  assert.deepEqual(disasterTransfers(s), []);
});

test("terminal river towns explain the shared-neighbor fallback instead of inventing a downstream route", () => {
  const s = createGame();
  s.phase = "build";
  s.events.archipelago = { type: "flood", loss: {} };
  s.civs.archipelago.choice = 0;
  const [transfer] = disasterTransfers(s);
  assert.equal(transfer.to, "enclave");
  assert.match(transfer.why, /share a connected resource/);
  assert(!transfer.why.includes("river carries"));
});
