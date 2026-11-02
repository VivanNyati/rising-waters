import { CIVS, EVENTS, GEOGRAPHY } from "./content";
import { describe, spillTarget } from "./engine";
import { townOf } from "./towns";
import { CIV_IDS, type GameState } from "./types";

/** The arrows describe the same cheap-choice transfers applied by resolveEvents. */
export function disasterTransfers(state: GameState) {
  if (state.phase !== "build") return [];
  return CIV_IDS.flatMap((from) => {
    const ev = state.events[from];
    const e = EVENTS[ev.type];
    if (
      ev.quiet ||
      state.civs[from].choice !== 0 ||
      !e.cheap.spillTo ||
      !e.cheap.spill
    )
      return [];
    const to = spillTarget(from, e.cheap.spillTo);
    const source = `${townOf(from).name} (${CIVS[from].name})`;
    const destination = `${townOf(to).name} (${CIVS[to].name})`;
    const routeType =
      e.cheap.spillTo === "downstream" && !GEOGRAPHY.downstream[from].length
        ? "shared"
        : e.cheap.spillTo;
    const route = {
      downstream:
        "The river carries the displaced pressure downstream along the connected water route.",
      downwind:
        "The prevailing wind carries the pressure toward this neighboring town.",
      shared:
        "The towns share a connected resource or regional network, so the local shortcut puts pressure on the neighbor.",
    }[routeType];
    return [
      {
        id: `${state.seed}:${state.round}:${from}:${ev.type}`,
        from,
        to,
        e,
        source,
        destination,
        why: `${source} chose “${e.cheap.label}”. ${route} ${e.lesson}`,
        impact: `Transferred goods loss: up to ${describe(e.cheap.spill)}, limited by the receiving town’s available stock. The incident also adds recovery pressure there.`,
      },
    ];
  });
}
