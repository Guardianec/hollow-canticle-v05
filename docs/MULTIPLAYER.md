# Hollow Canticle v0.6 — Online Co-op & Duels

This branch adds private, account-free friend rooms. The public candidate uses a
Render **Free Web Service**, with the static client on the existing GitHub Pages
host: [play](https://guardianec.github.io/hollow-canticle-v05/),
[health](https://hollow-canticle-online.onrender.com/healthz).

## Authority and shared rules

Colyseus **0.18.10**, SDK **0.18.6**, Schema **5.0.42**. The installed project
skill came from `npx skills add colyseus/skill --agent codex --yes`.

`shared/session.ts` coordinates the existing `src/game/world.ts` simulation.
Each Pilgrim has an individual World for their character, buffs, inventory,
relics and seeded loot. Co-op Worlds share the authoritative enemies,
projectiles, floor and ThreatDirector. They use the existing melee moves,
defense resolver, posture, ranged offerings, inventory and execution rules.
The duel adapter resolves those same character attacks against another player
and normalizes progression. Rendering never runs on the server.

`CoopRoom` and `DuelRoom` share connection/lobby/Schema plumbing in `FriendRoom`.
`setFixedTimestep` runs at **30 Hz**; binary Schema delta patches run every
**50 ms (20 Hz)**. The client sends one compact input snapshot per fixed step,
with an application sequence and bounded combat timestamp. HP, hit results,
loot, deaths, revivals and round wins are never accepted from clients.

The client predicts local movement with the same wall/obstacle resolver used
offline and on the server. After an authoritative acknowledgement it discards
processed commands and replays the remaining movement commands. Corrections
blend at small distances, accelerate above 35 units and snap above 100 units.
Remote players and enemies use a **100 ms interpolation buffer**. Attacks and
projectiles are authoritative; the local parry ring is provisional feedback.
Movement prediction does not predict enemy separation or all ice drift, so
those contacts can require corrections.

## Defensive latency compensation

The server keeps **500 ms** of bounded player history and **300 ms** of contact
records. A defensive input may validate against a recorded melee/projectile
contact within **250 ms**, further bounded by server-measured RTT / 2 + 100 ms
render delay + two ticks. Invalid/non-finite or future stamps cannot enlarge
this budget. Historical state must allow a guard and historical geometry must
be in reach. A contact can be compensated only once. The original normal and
perfect windows remain distinct; compensation does not widen either window.

A confirmed late guard undoes that contact's HP, Focus and posture penalties and applies the existing
parry/reflect rule. Reflections, Focus and recharge belong to the defender.
Duel round awards wait 250 ms for in-flight defensive inputs. This is bounded
contact validation rather than full-world rollback: interactions with several
near-simultaneous hits and recovery cancels need further human fairness review.

## Friend rooms and lifecycle

- Five-character room IDs/codes use `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.
  Cryptographic random selection and an in-memory reservation set prevent
  live collisions. There is no room directory or public matchmaking.
- Names are normalized and limited to 1–20 letters/numbers plus ordinary
  spaces/punctuation. Control, bidi-control and combining-mark abuse is rejected.
- Players choose characters independently; duplicates are valid. All four are
  available online without altering single-player unlocks.
- At least two connected players, all ready, are required. Only the lobby host
  sets the seed and starts. Starting locks the room against new joins.
- Dropped players become non-interactive and untargetable for a **30 second**
  reserved seat. The SDK retries automatically, including early connection
  drops. Reloaded clients can choose **Reconnect to reserved seat** in Online.
- Host status transfers to a connected player. The host never owns authority.
- Expired seats are removed. A co-op run can continue with one survivor. The
  current encounter is not rebuilt after a departure; future rooms rescale.
- Empty rooms dispose with their room clock and code reservation. Restarts lose
  all active rooms. No database, Redis, cloud saves, accounts or rankings exist.

Messages are capped at 90/second/client and 4 KiB. Input buffers are bounded;
movement axes and aim are clamped. Missing input stops movement after 200 ms.
HTTP requests and total live room count are bounded. HTTP and WebSocket origins
are restricted with `ALLOWED_ORIGINS`. CORS is a browser boundary, not account
authentication; people who possess a room code can join its lobby.

## Co-op: 2–4 players

| Party       | Encounter budget | Ordinary HP | Ordinary posture | Count cap            | Boss HP | Boss posture |
| ----------- | ---------------- | ----------- | ---------------- | -------------------- | ------- | ------------ |
| 1 remaining | 1.00×            | 1.00×       | 1.00×            | Existing composition | 1.00×   | 1.00×        |
| 2           | 1.55×            | 1.08×       | 1.05×            | 6                    | 1.65×   | 1.30×        |
| 3           | 2.05×            | 1.14×       | 1.10×            | 7                    | 2.20×   | 1.55×        |
| 4           | 2.55×            | 1.20×       | 1.15×            | 8                    | 2.75×   | 1.80×        |

These are starting values, covered by deterministic tests, **not human balance
sign-off**. Existing elite rooms retain their elite modifiers. Multiplayer adds
affordable role variety and ranged support rather than ordinary HP sponges.
The existing map's elite-room probability is unchanged. Ordinary combat rooms
add a seeded 6% / 12% / 18% chance for one elite front-line enemy with 2 / 3 / 4
players. That enemy receives a further 1.12× HP and 1.10× posture, and is marked
Elite in the target title. This does not increase the enemy count cap.
A boss room has one Saint; 3 players add an Acolyte, 4 also add a Shieldbearer.

Aggro weighs distance, recent damage/posture pressure, ranged/use activity,
assigned pressure and target stickiness. Normal targets commit for 1.8 seconds;
bosses for 1.2 seconds, and committed tells do not retarget mid-swing. Threat
reservations consider the victim: two concurrent timelines for two players,
three for larger parties, with existing special-attack spacing per target.

Players do not hard-collide. Friendly fire is off, including reflections. Any
physically eligible player can intercept a melee strike or projectile. A
different player's hit within 0.8 seconds of a perfect parry adds a one-use
**12% posture-pressure** cross-counter bonus.

Living players gather within 125 units of the same exit, and one presses E
within 115 units, after combat and rewards finish. Stairs require the connected
survivors together at the center. Dead players do not block travel. A reserved
disconnected seat blocks a passage until it reconnects or its grace period expires.

### Death and revival

A fallen Pilgrim cannot act and is removed from targeting. A/D or arrow keys
cycle living teammates; the HUD names the followed character and their HP.
There is no timed or mid-room revival. A hazard death stays fallen until the
next successfully cleared combat room.

Before clearing a room the server checks for a party wipe. If everybody is
dead, the run ends, including a simultaneous last-enemy kill. Otherwise it:

1. Clears hostile projectiles, attack reservations and delayed room echoes.
2. Revives dead players at **exactly `min(20, maxHP)` HP**, zero posture, zero
   Focus, idle state, with 1.5 seconds of protection.
3. Preserves character, relics, inventory and ranged charge/recharge state.
4. Unlocks the room, emits revival/clear events, then rolls personal rewards.

The half-second reward reveal happens after revival. Each player owns their
relic choices and consumable pickups. Items, selection, buffs, relics and
pickups synchronize from the server. Online runs currently do not award local
Chronicle currency or unlocks. Duels never do.

## Duels

Exactly two players, all four Pilgrims, no progression bonuses, relics,
consumables or Resonance advantage. Character base HP, damage, posture,
movement, ranged capacity and recharge remain standardized by character.

Seeded arena art chooses Ruined Cloister, Frozen Court or Ember Platform.
Collision is a symmetrical 800×480 court, without pillars or damaging hazards.
Each client focuses the opponent from its own camera. Melee, heavy attacks,
parry/perfect parry, dodge, posture break, execution, ranged offerings and
reflection resolve on the server. Player melee contacts resolve after both
players' movement phase to avoid a fixed seat receiving an earlier combat clock.

Three-second countdown; **first to three rounds**. A round resets HP, posture,
Focus, charges, temporary state and position. A double KO awards no point.
Two seconds between rounds. Both players must request a rematch, which reopens
character selection. A disconnect pauses the duel for reconnection; expiration
forfeits the match. Co-op continues while a player's local menu is open; the
pause overlay explicitly warns that the game continues.

## Local development and validation

Use Node 24 LTS. No global server tools are required.

```sh
npm ci
npm run dev:server
# Separate terminal:
npm run dev
```

Development defaults to `ws://localhost:2567`; a production client needs an
explicit build environment URL. `.env.example` documents all variables.

```sh
npm run lint
npm test
npm run assets:validate
npm run build:server
npm run test:server
npm run test:load -- 20
```

`npm run net:proxy -- 100` exposes `ws://127.0.0.1:2570`, relaying the local
authority with 100 ms RTT and jitter. Presets: `LAN`, `50`, `100`, `150`, `BAD`.
Set `VITE_MULTIPLAYER_URL=ws://127.0.0.1:2570` while using it. This local-only
proxy preserves reliable ordering. It simulates delay/jitter, not true packet
loss. The automated tests also use current Colyseus `simulateLatency` at
0/50/100/150/200 ms and test historical combat timing separately.

`?debug` shows server/client ticks, ping, correction distance, input ack,
interpolation delay, room ID/code, party/entity counts and approximate WebSocket
payload bandwidth. No debug data is uploaded. See [QA](QA-v0.6.md).

## Exact free deployment

Repository: `Guardianec/hollow-canticle-v05`; branch:
`codex/v0.6.0-online-multiplayer`. Do not deploy the preserved alpha repository.

Create a Render Blueprint from that branch's root `render.yaml`, or a Web
Service with these exact settings:

| Setting                 | Value                                                        |
| ----------------------- | ------------------------------------------------------------ |
| Instance plan           | **Free**                                                     |
| Runtime                 | Node 24                                                      |
| Root directory          | Repository root (leave blank)                                |
| Build                   | `npm ci --include=dev && npm run build:server`               |
| Start                   | `npm run start:server`                                       |
| Health path             | `/healthz`                                                   |
| Bind                    | `0.0.0.0`, Render-provided `PORT`                            |
| `NODE_ENV`              | `production`                                                 |
| `ALLOWED_ORIGINS`       | `https://guardianec.github.io` plus deliberate local origins |
| Auto deploy             | Off; deploy reviewed branch changes manually                 |
| Database / disk / Redis | **None**                                                     |

Development tools are explicitly included during build because Render's
production environment otherwise omits TypeScript/esbuild dev dependencies.
The server bundle contains gameplay code and imports installed packages; it
does not serve GLBs, textures or the static game.

The deployed static client uses:

```text
VITE_MULTIPLAYER_URL=wss://hollow-canticle-online.onrender.com
```

The GitHub Pages workflow accepts `multiplayer_url` on manual dispatch, or the
repository Actions variable `VITE_MULTIPLAYER_URL`. Select the multiplayer branch
when manually publishing after server health is verified. No merge is needed.
The user approved allowing this exact branch in the `github-pages` environment;
its existing `main` rule remains. Publishing the artifact does not merge branches.
Never put a private key or token in a Vite variable; the service URL is public.

Render's [Free service rules](https://render.com/docs/free) include sleeping after
15 minutes without inbound HTTP/WebSocket traffic and loss of in-memory rooms
on restart. Opening Online sends a health request, shows **WAKING THE CANTICLE…**,
retries for up to two minutes, and allows cancellation. Polling stops when the
menu closes or the service wakes. There are no idle keepalive jobs. Active
players' ordinary traffic is sufficient. Neither single-player nor startup
depends on Render.

The service `hollow-canticle-online` was created after the user signed in, in
Frankfurt, on **Free ($0/month, 0.1 CPU, 512 MB)**. Service ID:
`srv-dbeeg2avcj2c73cmu7fg`. It runs authority commit `22041af845b026120f279553928ec1eb81acf470`;
the later departure fix changes only the browser client. Auto deploy is off.
No database, Redis, disk, payment information or paid resource was added.

Hosted verification exposed a delayed socket close acknowledgement: the server
had already removed the leaving seat, but the SDK's leave promise stayed pending.
The client now disables reconnection for intentional departure, sends normal
leave, and closes locally with the consented code after at most one second.
Callbacks from departed rooms cannot mark a new connection as lost. Unexpected
drops still retain the normal 30-second reconnection reservation.
