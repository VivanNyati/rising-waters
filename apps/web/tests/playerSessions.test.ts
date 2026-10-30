import test from "node:test";
import assert from "node:assert/strict";
import { PLAYER_COOKIE, readPlayerCookie } from "../src/game/playerCookie";

test("session cookie lookup accepts only a complete UUID in the exact cookie", () => {
  const id = "e2ba7599-4618-41a8-a435-53af75cec7f1";
  assert.equal(
    readPlayerCookie(`other=x; ${PLAYER_COOKIE}=${id}; theme=dark`),
    id,
  );
  assert.equal(readPlayerCookie(`${PLAYER_COOKIE}-other=${id}`), undefined);
  for (const invalid of ["", "garbage", `${id}junk`, "' OR 1=1", "%00"])
    assert.equal(readPlayerCookie(`${PLAYER_COOKIE}=${invalid}`), undefined);
  assert.equal(readPlayerCookie(""), undefined);
});
