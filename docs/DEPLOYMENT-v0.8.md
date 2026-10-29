# Trials of the Five Realms — authorized candidate deployment

Published 2026-10-29 at the user's explicit request to push main and deploy.
This publishes the implementation candidate with its documented acceptance gaps;
it does not turn PARTIAL audit items into PASS or declare release acceptance.
Package version remains 0.7.0. Multiplayer advertises `0.8.0-candidate`, protocol 8.

| Component            | Verified result                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Repository           | `Guardianec/hollow-canticle-v05`; preserved alpha repository unchanged                                                                   |
| Runtime source       | `526fd4a8649ee8203092077c9bf34280e01d368a`, fast-forwarded to main                                                                       |
| Feature branch       | `codex/v0.8.0-five-realms` preserved                                                                                                     |
| Client               | [Play Hollow Canticle](https://guardianec.github.io/hollow-canticle-v05/)                                                                |
| Pages workflow       | [Successful run 40845681198](https://github.com/Guardianec/hollow-canticle-v05/actions/runs/40845681198)                                 |
| Main validation      | [Successful run 40845681199](https://github.com/Guardianec/hollow-canticle-v05/actions/runs/40845681199)                                 |
| Authority            | [Public health](https://hollow-canticle-online.onrender.com/healthz), WSS on same host                                                   |
| Server result        | `{ "ok": true, "protocol": 8, "build": "0.8.0-candidate" }`                                                                              |
| Render deployment    | [dep-dbhgk5oae00c73dnovfg](https://dashboard.render.com/web/srv-dbeeg2avcj2c73cmu7fg/deploys/dep-dbhgk5oae00c73dnovfg), Deploy succeeded |
| Server configuration | Existing Free plan, Frankfurt, Node 24, manual deployment; branch changed from old v0.6 to main                                          |
| Static configuration | `VITE_MULTIPLAYER_URL=wss://hollow-canticle-online.onrender.com`                                                                         |

No paid resources, database, persistent disk, new credentials or online analytics
were added. Existing in-memory rooms do not survive a server restart. Save schema
and browser progress keys remain unchanged.

## Verification

- Feature CI and main CI pass, including full tests, lint, 168-asset validation,
  client build and server build. The Linux-only parallel-client test race was fixed
  by sending Start from the actual server-declared host. Production authorization
  was correct and unchanged. Local server tests also passed 45/45.
- All **187 published files / 51,531,147 bytes** match the production build.
  License text comparisons use canonical Git LF bytes for Windows checkouts.
  [Raw file verification](metrics/v08-publication.json).
- Real hosted SDK smoke passed four-client co-op with sword/twins/spear/Shinobi,
  party budget 2.55, movement acknowledgement, dropped-seat reconnection,
  intentional departure and host transfer. Temporary test rooms were closed.
- Hosted Duel reached its active round, acknowledged ranged input and exposed
  zero environmental gameplay areas. [Raw hosted result](metrics/v08-hosted.json).
- Published browser Online reports **Awake**, reaching the updated server. No
  warnings/errors were observed in that browser smoke check. Deployment screenshots
  show the [server result](screenshots/v08/deployment-render.png) and
  [published client](screenshots/v08/deployment-online.png).

Hosted SDK/browser smoke is not a complete human floor, boss or Duel playthrough.
FPS remains recorded as blocked by browser throttling per the user's direction.
Browser access became available for publication checks; the earlier usage-limit
block remains historical evidence, not a current claim that deployment was blocked.
See [QA](QA-v0.8.md), [original-request audit](ORIGINAL-REQUEST-AUDIT-v0.8.md) and
[29-topic implementation report](RELEASE-v0.8.md) for the remaining acceptance work.

This documentation/evidence follow-up changes no runtime source or compiled assets.
The deployed runtime commit above remains the reproducible publication checkpoint.
