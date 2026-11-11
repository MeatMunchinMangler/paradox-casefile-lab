# PARADOX — Find what cannot be true.

A new playable **consumer micro-mystery experiment** built on November 11, 2026.
This is not Noriel Lead Desk or an AI wrapper. It is a deliberately small,
original, mobile-first game built to test whether people enjoy and *share*
a sixty-second logic challenge.

## Experience

- 12 authored original fictional mysteries, six evidence cards per case.
- Pick exactly two statements that logically cannot coexist.
- Wrong answers keep the secret; correct answers reveal the explanation.
- Two progressive hints, a score that rewards accurate first answers, and
  on-device case progress.
- Daily case selection uses the UTC date and **cycles the 12-case library**.
  This is not a claim that new authored content arrives every day.
- Archive replay, spoiler-free challenge URL and local progress.
- Mobile-first, reduced-motion support, keyboard-accessible buttons.
- No logins, profiling, analytics, paid AI APIs, payments, messaging, nor
  customer data. Sharing is user-initiated using the native share sheet
  or copy/paste. Progress is **localStorage on that one browser**, never synced.

## Launch locally on the Mac

Double-click **`OPEN_PARADOX.command`** to open the game in the default browser
on a new ephemeral localhost port. Leave the Terminal window open while playing,
and press Ctrl+C to stop the server.

Alternatively:

```sh
python3 -B server.py --port 0
# Open the printed PARADOX_LOCAL_URL on this Mac
```

The server binds **only to 127.0.0.1**. A local URL is not reachable from
another person's phone; an actual public challenge link requires a separately
approved, reviewed host/deployment. Do not send localhost challenge URLs
to potential players as if they are public.

## Independent tests

```sh
python3 -B -m unittest discover -s tests -v
node --test tests/logic.test.mjs
node --check app.js
# With the server running at the printed loopback URL:
node tools/browser_proof.mjs http://127.0.0.1:PORT/
```

The browser proof opens its **own headless Chrome profile**, not the owner's
Safari, tests six actual device metric overrides (320/375/390/768/1024/1440),
wrong verdict -> correct solution, scoring, hints, navigation, daily routing,
and persistence. Screenshots are saved privately in `.test-artifacts/`
and are gitignored. The proof controls only its own Chrome subprocess.

## Scope and release boundaries

This is an entirely local **functional prototype**, not a hosted beta, published
App Store app, registered trademark, connected billing service, paid product,
or verified customer/retention experiment. The temporary server can stop.
No private source archive, Noriel memory, Mac Keychain, or personal data is
required. All cases are invented fiction and may need a manual editorial
solvability review beyond schema tests before consumer release.

To host later: approve a specific verified static deployment, replace local-only
share links with the hosted origin, add a privacy page and original-content
review, verify the brand name and platform terms, test browser CSP and refresh,
and invite people only with their consent. No public user submissions are needed
for the first playtest.

See `OPPORTUNITY_LEDGER.md` for primary market signals, contrary evidence
and honest validation gates.

## Connection to the wider vision

PARADOX is one independent **Master App Builder** experiment, not a replacement
for Noriel, Humanity Frontier, or Human Coordination. ORCHESTRA may read this
git and test history as provenance, but must not grant app permissions,
summarize fictional cases as scientific truth, or auto-deploy without review.

**Joy is law** means people should feel wonder and play, not be forced into
an algorithmic dependency. The game works completely without an AI model.
