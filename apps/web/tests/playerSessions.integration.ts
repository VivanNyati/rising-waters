import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DbConnection } from "../src/module_bindings";

const clients: DbConnection[] = [];
async function client() {
  return new Promise<DbConnection>((resolve, reject) => {
    const conn = DbConnection.builder()
      .withUri(process.env.NEXT_PUBLIC_SPACETIME_URI || "ws://127.0.0.1:3001")
      .withDatabaseName(
        process.env.NEXT_PUBLIC_SPACETIME_DATABASE || "earthshare-game-local",
      )
      .onConnect((conn) =>
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve(conn))
          .onError((ctx) => reject(ctx.event))
          .subscribe("SELECT * FROM player_session_total"),
      )
      .onConnectError((_ctx, error) => reject(error))
      .build();
    clients.push(conn);
  });
}
async function until(check: () => boolean) {
  const end = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > end) throw Error("Session count did not synchronize");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function main() {
  try {
    const first = await client(),
      second = await client();
    const count = (conn: DbConnection) =>
      conn.db.playerSessionTotal.id.find(0)?.count ?? 0n;
    const before = count(first);
    const cookieId = randomUUID();
    // A menu subscription does not register a play. Different SDK identities sharing
    // a cookie (tabs, reconnects) still register exactly once, even concurrently.
    assert.equal(count(second), before);
    await Promise.all([
      first.reducers.registerPlayerSession({ cookieId }),
      second.reducers.registerPlayerSession({ cookieId }),
    ]);
    await until(
      () => count(first) === before + 1n && count(second) === before + 1n,
    );
    await assert.rejects(
      first.reducers.registerPlayerSession({ cookieId: "invalid" }),
    );
    await second.reducers.registerPlayerSession({ cookieId: randomUUID() });
    await until(() => count(first) === before + 2n);
    const reconnected = await client();
    await reconnected.reducers.registerPlayerSession({ cookieId });
    assert.equal(count(reconnected), before + 2n);
    // Anonymous menu clients cannot subscribe to the deduplication table.
    await assert.rejects(
      new Promise<void>((resolve, reject) =>
        reconnected
          .subscriptionBuilder()
          .onApplied(() => resolve())
          .onError((ctx) => reject(ctx.event))
          .subscribe("SELECT * FROM player_session"),
      ),
    );
    console.log(
      "Session integration passed: unique cookies, concurrent deduplication, reconnects, live totals, private IDs.",
    );
  } finally {
    clients.forEach((conn) => conn.disconnect());
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
