# Content Security Policy rollout

## Where things stand

[`vercel.json`](../vercel.json) now sends two policies:

**Enforced** — directives that cannot break a working app:

```
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

That closes clickjacking, plugin embedding, `<base>` hijacking, and form
exfiltration to third-party hosts.

**Report-Only** — the full policy, including `script-src 'self'`:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:;
media-src 'self' blob:; connect-src 'self' https: wss:; worker-src 'self' blob:;
frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Report-Only reports violations to the browser console and changes nothing.

## Why script-src is not enforced yet

`script-src 'self'` is the directive that would actually contain an XSS, and it
is also the one most likely to white-screen the app. The build looks compatible:
the only inline `<script>` in `index.html` is a JSON-LD data block, and the
entry point is an external module. But several bundled libraries — chart, PDF
and animation packages — are known to reach for `eval` or the `Function`
constructor, and that can only be settled by loading the real app in a browser.

Enforcing a policy that has not been observed is how a security header becomes
an outage.

## Flipping it on

1. Deploy as-is. Open the app as each role — owner, principal, teacher,
   accountant, parent, student — and exercise the heavy pages: dashboards,
   report cards, fee vouchers, the timetable builder, PDF export, the AI
   assistant.
2. Watch the console for `Content Security Policy` violation reports.
3. If there are none, move the Report-Only value into the
   `Content-Security-Policy` key and remove the Report-Only header.
4. If something needs `eval`, prefer replacing the library. Only fall back to
   `'unsafe-eval'` if that is not practical — and note that `'unsafe-inline'` in
   `script-src` would defeat the point entirely, so never add that one.

## Related

The stored-XSS path this defends against is fixed at source in
[`src/lib/copilot-markdown.ts`](../src/lib/copilot-markdown.ts): assistant output
is HTML-escaped before any formatting is applied, covered by
`copilot-markdown.test.ts`. CSP is the second line, not the first.

Files served by the API carry their own hard policy
(`default-src 'none'; sandbox`) and are sent as attachments unless they are a
known-safe image or PDF — see `backend/app/routers/vps_storage.py`.

## Token storage (done)

Tokens are no longer kept in `localStorage`:

- The **refresh token** — the 30-day credential — is issued as an
  `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/auth`. Script
  cannot read it, and the browser will not attach it to a request started by
  another site, which is what protects the refresh endpoint from CSRF.
- The **access token** lives in a module variable
  ([`src/lib/token-store.ts`](../src/lib/token-store.ts)). A reload starts with
  none and recovers one from the cookie, so the most an XSS can take is a token
  that expires in an hour and cannot be renewed once the tab closes.

Browsers still holding pre-cookie tokens are migrated on their next load: the
old refresh token is exchanged once, the cookie is issued, and both legacy keys
are deleted. Nobody is signed out.

Because the SPA reaches the API through a same-origin `/api` rewrite, the
`SameSite=Strict` cookie is sent normally. A client that called the Railway
origin directly would be cross-site and would not get the cookie — keep
`VITE_API_URL` pointing at the same-origin path.
