# v0.6 multiplayer QA — 24 October 2026

Status: **review candidate, not full release acceptance**. The original deployed
commit is `66c42198b57b2ccb9f1ba00c867c3da2eb98d459`, verified against `v05/main`
and GitHub's successful Pages workflow. All changes stay on
`codex/v0.6.0-online-multiplayer`; neither deployed branch was overwritten.

## Automated checks performed

| Check                           | Result                                                 |
| ------------------------------- | ------------------------------------------------------ |
| Baseline tests before edits     | 105 passed                                             |
| Baseline production build       | Passed                                                 |
| Final combined tests            | **146 passed in 11 files**                             |
| Final test command on this host | `npm.cmd test -- --maxWorkers=1`                       |
| ESLint and TypeScript           | Passed                                                 |
| Production static client build  | Passed                                                 |
| Production server build         | Passed; approximately 160 KiB of bundled gameplay code |
| Blender asset validation        | 152 assets, 15 PBR families, 505,800 LOD0 triangles    |

The existing 10,000-floor test timed out during one run that competed with two
rendering browser clients and concurrent builds. Its 30-second timeout was not
weakened. After closing the competing work, the complete one-worker run passed
in 43.57 seconds total. The initial sandbox test attempt also encountered a
Windows temporary-file rename restriction; running outside that sandbox passed.

The 41 multiplayer cases cover:

- Names, monotonic sequences, axis sanitization and ignored client outcomes.
- Deterministic 2/3/4-player encounter budgets, ranged support, count caps,
  increasing elite chance, single-Saint HP scaling and bounded ordinary HP.
- Exact 20 HP room-clear revival, including two dead companions and boss clear;
  preserved inventory/charges, zero Focus/posture and 1.5-second protection.
- No timed/hazard-room revival and no revival on a simultaneous party wipe.
- Physical rescue parries, interception, reflected projectile ownership and
  co-op friendly-fire exclusion.
- Personal relic validation, separate inventories, same-room gathering and
  reserved disconnected seats blocking passage until reconnection/expiry.
- Actual Colyseus HTTP/WebSocket rooms, four-client capacity, no late join,
  all-ready start, immutable running character choice and state patches.
- Automatic reconnection, expiry, host transfer and room disposal. The expiry
  test accelerates the reservation to 0.1 seconds with a test spy; the production
  reservation remains 30 seconds.
- Duel normalization, countdown, first-to-three, round reset, mutual rematch,
  normal/perfect guards, dodge, damage, reflection, posture break, execution and
  duplicate-finisher prevention.

## Latency checks

| Simulated RTT | Sequenced input + patch test | Historical melee parry |
| ------------- | ---------------------------- | ---------------------- |
| 0 ms          | Passed                       | Passed                 |
| 50 ms         | Passed                       | Passed                 |
| 100 ms        | Passed                       | Passed                 |
| 150 ms        | Passed                       | Passed                 |
| 200 ms        | Passed                       | Passed                 |

The network rows use Colyseus's current `simulateLatency()` over actual sockets.
Historical-contact tests separately exercise delayed defense, ordinary versus
perfect timing, stale timestamps, duplicate compensation and late projectile
reflection with HP/Focus/posture restoration. These are deterministic correctness
tests; they do not establish human parry feel at those latencies.

The local delay/jitter proxy has LAN, 50, 100, 150 and BAD presets. True packet
loss and sustained jittered human duels were not acceptance-tested. WebSocket
delivery is reliable and the proxy preserves delta-patch ordering.
A final SDK smoke connection through the 100 ms RTT / ±10 ms per-direction
jitter proxy created a room and received the authoritative ready patch in
185.45 ms, including the patch cadence. Explicit leave also completed cleanly.

## Local load measurement

Actual result: [v06-load.json](metrics/v06-load.json).

Five simultaneous co-op rooms × four SDK clients each. Each room contains
eight enemies including a Saint and ranged support. Moving clients issue melee,
parry and ranged inputs; invulnerability keeps the workload alive for 20 seconds.

| Metric                         | Observed                              |
| ------------------------------ | ------------------------------------- |
| Room simulation rate           | 30.14–30.19 ticks/sec over the sample |
| Combined process RSS           | 167.27 MiB                            |
| Combined JS heap               | 58.93 MiB                             |
| CPU                            | 25.08% of one local core              |
| Event-loop delay p95 / maximum | 26.03 ms / 61.15 ms                   |
| Downstream per client          | 3,346 bytes/sec, about 3.27 KiB/sec   |
| Upstream per client            | 589 bytes/sec, about 0.58 KiB/sec     |

This process includes **both the authority and all 20 SDK clients**. Byte counts
are WebSocket payloads, excluding framing/TLS, assets and HTTP matchmaking. The
sample is a local stability check, not a Render capacity or sustained leak
certification. Render Free CPU scheduling still requires a deployed measurement.

## Browser checks actually performed

Production Vite output was served locally with the production-like bundled
authority. Two browser clients created/joined a co-op room, independently chose
Oathkeeper and Moth, readied and began. Their Blender models and identity rings
appeared together. One player reached the exit and could not leave alone; once
both gathered, both transitioned to the same authoritative combat room.

A first-room combat attempt issued movement, ranged, parry, melee and heavy
inputs and ended in a party wipe; both clients displayed the shared summary.
It did **not** establish successful multi-room play or difficulty acceptance.
Three-/four-player simulation and socket/load sessions ran automatically; no
three-/four-human browser playthrough was performed.

A second two-browser session chose Lancer versus Bellbearer, displayed the duel
countdown/arena/score, and exchanged ranged inputs and guards. The local pause
overlay warned that online play continues. A reload offered the reserved seat
and successfully restored the duel's authoritative HP and score. Full human
first-to-three matches across all class combinations remain unverified.

The Online screen was opened while the authority was stopped. It showed
**WAKING THE CANTICLE…** with disabled mode buttons. Starting the authority caused
an automatic transition to **Awake**, without reload or user retry.

Online menu/lobby layouts were inspected at 1440×900, 768×1024 and 390×844.
The phone lobby's `scrollWidth` and `clientWidth` were both 348 pixels, with all
controls contained. Viewport overrides were reset. A fresh final QA tab reported
no console warnings/errors after creation and wake recovery. Earlier browser
testing caught and fixed an initial-state race; no claim is made that earlier
broken builds emitted no errors.

Evidence:

- [Desktop Online](screenshots/v06/online-desktop.png)
- [Desktop lobby](screenshots/v06/lobby-desktop.png)
- [Tablet lobby](screenshots/v06/lobby-tablet.png)
- [Phone Online](screenshots/v06/online-mobile.png)
- [Phone lobby](screenshots/v06/lobby-mobile.png)
- [Waking state](screenshots/v06/waking.png)
- [Two-client duel](screenshots/v06/duel.png)

## Deployment and remaining limits

Render sign-in rejected the available GitHub login because it is configured for
deployments but not as a login method. **No Render service or public multiplayer
URL was created.** The Free Blueprint and exact deployment steps are in
[MULTIPLAYER.md](MULTIPLAYER.md). The existing static v0.5 deployment is unchanged.
No paid service, database, disk, account backend or idle-traffic job was created.

Remaining acceptance work:

- Authenticate Render, create the Free service, verify HTTPS/WSS and publish the
  static client with its actual service URL.
- Measure actual Render cold start, CPU scheduling, sustained memory and free
  allocation limits. Local memory use alone does not prove hosted capacity.
- Perform natural multi-room two-/three-/four-player runs and experienced-player
  difficulty/readability review, including four players versus the Saint.
- Run sustained human duels at 100/150 ms plus jitter and mild network loss.
- Review near-simultaneous multi-hit latency fairness. Contact compensation is
  bounded historical validation, not full rollback of every buff/relic side effect.
- Prediction currently reconciles enemy separation and ice drift instead of
  reproducing those locally. Projectiles render authoritative patch positions.
- Co-op currently records no local Chronicle rewards/history. Duel progression
  remains completely isolated. Local duel win/loss statistics are not recorded.
- No mobile gameplay, controller testing or cross-browser acceptance is claimed.

`npm audit` reported 14 low and 3 moderate findings, no high/critical findings.
The moderate chain is `grant → request-oauth → uuid`, brought in by Colyseus's
optional auth dependencies. This application mounts no OAuth/account routes.
The offered forced remediation downgrades Colyseus to 0.15; it was not applied.
Upstream dependency updates should be reviewed before a broader public release.
Headroom's on-demand audit compression was retained under
`77d7ce50330759f1201be6b0`; no claim of automatic traffic compression is made.
