export const PLAYER_COOKIE = "earthshare-player-session";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function readPlayerCookie(cookies: string): string | undefined {
  const value = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PLAYER_COOKIE}=`))
    ?.slice(PLAYER_COOKIE.length + 1);
  return value && UUID.test(value) ? value : undefined;
}

/** A cookie represents a browser, independently of multiplayer identity or saves. */
export function playerCookie(): string | undefined {
  const existing = readPlayerCookie(document.cookie);
  if (existing) return existing;
  const id = crypto.randomUUID();
  document.cookie = `${PLAYER_COOKIE}=${id}; Path=/; Max-Age=34560000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  // Do not count repeatedly when cookies are disabled.
  return readPlayerCookie(document.cookie);
}
