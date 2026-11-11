# Optional playtest link — local change, not deployed

The PARADOX result dialog now offers a clearly voluntary Moonshot Lab feedback link; the footer repeats it for people who do not finish a case.

Exact destination: https://moonshot-launch-deck-20261111.vercel.app/playtest.html?app=paradox

This is explicit outbound navigation in a new safe tab (noopener/noreferrer) and does not share a score, case ID, device identifier, or localStorage state. PARADOX itself still collects no analytics, account, cookies or submissions.

Release dependency: the linked Moonshot Lab playtest must be deployed with allowlisted app=paradox preselection before or alongside the game change. Never claim the change is live while these local branches remain unpublished.

The cross-product local browser run passed 19 checks at four viewport widths with zero unexpected external requests or JS errors. Original PARADOX suites passed 6 Node and 16 Python tests. Complete sanitized acceptance record and joint release checklist are in the separate owner-private Moonshot Lab source.

This is a feedback delivery improvement, not a revenue signal: zero verified external playtesters, paid buyers, or settled revenue. No new deployment, promotion, API call, private record access or external message occurred.
