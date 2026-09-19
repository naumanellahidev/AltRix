/**
 * Where the session credentials live.
 *
 * The access token is held in a module variable, not in localStorage. The
 * refresh token is not held in JavaScript at all — the server sends it as an
 * HttpOnly cookie, which script cannot read.
 *
 * Why it matters: with both tokens in localStorage, a single XSS anywhere on
 * the origin reads them and the attacker keeps a 30-day session. With the
 * refresh token behind HttpOnly, the worst an XSS can take is an access token
 * that expires in an hour and cannot be renewed once the tab is gone.
 *
 * The cost is that a page reload loses the in-memory token. That is recovered
 * by calling /auth/refresh on boot, which succeeds on the strength of the
 * cookie. `bootstrapSession()` does that, and also migrates anyone still
 * carrying tokens in localStorage from before this change.
 */

const LEGACY_ACCESS_KEY = "access_token";
const LEGACY_REFRESH_KEY = "refresh_token";

let accessToken: string | null = null;

/** Resolves once the boot-time refresh has finished, so callers can await it. */
let bootstrapPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token || null;
}

export function clearTokens(): void {
  accessToken = null;
  bootstrapPromise = null;
  purgeLegacyTokens();
}

/** Remove anything this app used to persist. Safe to call repeatedly. */
export function purgeLegacyTokens(): void {
  try {
    localStorage.removeItem(LEGACY_ACCESS_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  } catch {
    // Private-mode browsers can throw on storage access; nothing to clean up.
  }
}

function readLegacy(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Restore a session on page load.
 *
 * Asks the server for a fresh access token using the refresh cookie. If this
 * browser still has a pre-cookie refresh token in localStorage, it is sent once
 * so the server can issue the cookie, and both legacy keys are then deleted —
 * users are migrated without being signed out.
 *
 * Returns the access token, or null when there is no usable session.
 */
export async function bootstrapSession(apiBaseUrl: string): Promise<string | null> {
  if (accessToken) return accessToken;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const legacyRefresh = readLegacy(LEGACY_REFRESH_KEY);
    try {
      const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the HttpOnly cookie.
        credentials: "include",
        body: JSON.stringify(
          legacyRefresh ? { refresh_token: legacyRefresh } : {},
        ),
      });

      if (!res.ok) {
        // No usable session. Drop the legacy keys either way so they cannot
        // linger in storage for an XSS to find later.
        purgeLegacyTokens();
        return null;
      }

      const data = await res.json();
      setAccessToken(data?.access_token ?? null);
      purgeLegacyTokens();
      return accessToken;
    } catch {
      return null;
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}
