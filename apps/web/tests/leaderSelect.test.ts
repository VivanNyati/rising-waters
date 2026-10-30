import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LeaderSelect from "../src/components/LeaderSelect";

test("solo selection hides the countdown and hot-seat keeps its 30-second timer", () => {
  const render = (mode: "solo" | "hotseat") =>
    renderToStaticMarkup(
      createElement(LeaderSelect, {
        mode,
        choice: "heartland",
        setChoice: () => {},
        onConfirm: () => {},
        sessionCount: "123",
      }),
    );
  assert.doesNotMatch(render("solo"), /hs-timer|seconds left/);
  assert.match(render("hotseat"), /aria-label="30 seconds left"/);
  assert.match(render("solo"), /PLAYER SESSIONS: 123/);
});
