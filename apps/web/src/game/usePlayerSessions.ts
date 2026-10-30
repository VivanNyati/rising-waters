"use client";
import { useEffect, useRef, useState } from "react";
import { DbConnection } from "@/module_bindings";
import { playerCookie } from "./playerCookie";

/** Uses a separate aggregate-only subscription, with no room or seat required. */
export function usePlayerSessions(playing: boolean): string {
  const [count, setCount] = useState("CONNECTING…");
  const played = useRef(false);
  useEffect(() => {
    played.current ||= playing;
    let stopped = false;
    let generation = 0;
    let connection: DbConnection | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    function unavailable() {
      if (stopped) return;
      clearTimeout(deadline);
      if (retry) return;
      setCount("UNAVAILABLE");
      retry = setTimeout(() => {
        retry = undefined;
        connect();
      }, 10_000);
    }
    function connect() {
      const attempt = ++generation;
      connection?.disconnect();
      const fail = () => {
        if (attempt === generation) unavailable();
      };
      connection = DbConnection.builder()
        .withUri(process.env.NEXT_PUBLIC_SPACETIME_URI || "ws://127.0.0.1:3001")
        .withDatabaseName(
          process.env.NEXT_PUBLIC_SPACETIME_DATABASE || "earthshare-game-local",
        )
        .onConnect((conn) => {
          if (stopped || attempt !== generation) {
            conn.disconnect();
            return;
          }
          const sync = () => {
            if (!stopped && attempt === generation)
              setCount(
                (
                  conn.db.playerSessionTotal.id.find(0)?.count ?? 0n
                ).toLocaleString(),
              );
          };
          conn.db.playerSessionTotal.onInsert(sync);
          conn.db.playerSessionTotal.onUpdate(sync);
          conn
            .subscriptionBuilder()
            .onApplied(async () => {
              if (stopped || attempt !== generation) return;
              clearTimeout(deadline);
              sync();
              if (!played.current || stopped) return;
              try {
                // Serialize cookie creation across tabs and Strict Mode remounts.
                const register = async () => {
                  if (stopped || attempt !== generation) return;
                  const cookieId = playerCookie();
                  if (cookieId)
                    await conn.reducers.registerPlayerSession({ cookieId });
                };
                if (navigator.locks)
                  await navigator.locks.request(
                    "earthshare-player-session",
                    register,
                  );
                else await register();
              } catch {
                fail();
              }
            })
            .onError(fail)
            .subscribe("SELECT * FROM player_session_total");
        })
        .onConnectError(fail)
        .onDisconnect(fail)
        .build();
      deadline = setTimeout(fail, 10_000);
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(deadline);
      connection?.disconnect();
    };
  }, [playing]);
  return count;
}
