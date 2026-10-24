# v0.6 release report

This is a publicly deployed review candidate. Automated and browser smoke checks
passed; sustained human balance/latency acceptance and hosting profiling remain open.

| Requested field         | Result                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Baseline             | `66c42198b57b2ccb9f1ba00c867c3da2eb98d459`                                                                                                                                        |
| 2. Branch               | `codex/v0.6.0-online-multiplayer` on `Guardianec/hollow-canticle-v05`                                                                                                             |
| 3. Final commit         | Published client `05eedc32ef9d9148b97d605c95d6fbe89ac2aeca`; authority `22041af845b026120f279553928ec1eb81acf470`. Documentation HEAD is reported with the delivery.              |
| 4. Colyseus             | Server 0.18.10; SDK 0.18.6; Schema 5.0.42                                                                                                                                         |
| 5. Architecture         | Separate co-op/duel rooms, shared authority coordinator and existing World combat                                                                                                 |
| 6. Simulation           | 30 Hz fixed timestep                                                                                                                                                              |
| 7. Patches              | 20 Hz Schema deltas                                                                                                                                                               |
| 8. Prediction           | Local movement, shared collision resolver, replay unacknowledged inputs                                                                                                           |
| 9. Interpolation        | 100 ms remote-player/enemy buffer                                                                                                                                                 |
| 10. Defensive latency   | 500 ms history, maximum 250 ms compensation, measured-RTT bound, single-use contacts                                                                                              |
| 11. Codes               | Five cryptographically selected unambiguous characters, collision-reserved in memory                                                                                              |
| 12. Reconnection        | 30-second untargetable reserved seat, automatic SDK retries and manual reload recovery                                                                                            |
| 13. Co-op limit         | 2–4 to start; one may continue after departures                                                                                                                                   |
| 14. Ordinary scaling    | Budgets 1/1.55/2.05/2.55; HP 1/1.08/1.14/1.20; posture 1/1.05/1.10/1.15                                                                                                           |
| 15. Enemy counts/elites | Original solo composition; caps 6/7/8 for 2/3/4. Additional single-elite chance 6/12/18%; elite gets 1.12× HP and 1.10× posture after party scaling                               |
| 16. Boss scaling        | HP 1/1.65/2.20/2.75; posture 1/1.30/1.55/1.80. Support at 3/4 players                                                                                                             |
| 17. Death               | No actions/targeting; spectate living teammates; no timed or mid-room revival                                                                                                     |
| 18. Revival             | Tested: exactly 20 HP on combat clear, zero Focus/posture, 1.5-second protection, inventory/relics/charges preserved                                                              |
| 19. Wipe                | All dead ends the run before any clear revival, including simultaneous last kills                                                                                                 |
| 20. Loot                | Server-owned individual rolls, relic selection, inventory and assigned pickups                                                                                                    |
| 21. Duel mechanics      | Melee/heavy/guard/perfect/dodge/posture/ranged/reflection/execution on server                                                                                                     |
| 22. Normalization       | Character baselines only; all four available; no relics/items/meta bonuses/Resonance advantage                                                                                    |
| 23. Format              | First to three, countdown, reset, double-KO replay and mutual rematch                                                                                                             |
| 24. Render URL          | [Render Free authority](https://hollow-canticle-online.onrender.com/healthz), WSS on same host; Frankfurt, 0.1 CPU / 512 MB, auto deploy off                                      |
| 25. Static URL          | [Play v0.6 candidate](https://guardianec.github.io/hollow-canticle-v05/); manually published from feature branch, both main commits preserved                                     |
| 26. Free limitations    | Sleep/cold start, ephemeral rooms, small CPU/memory/free allocations; no keepalive jobs or paid fallbacks                                                                         |
| 27. Latency results     | Automated real transport and historical defense pass at 0/50/100/150/200 ms; human jitter fairness pending                                                                        |
| 28. Performance         | Five 4-player/8-enemy rooms: ~30 Hz, combined authority+20 clients 167.27 MiB RSS, 25.08% local core; not a Render benchmark                                                      |
| 29. Bandwidth           | ~3.27 KiB/sec down, ~0.58 KiB/sec up per client; payload-only local approximation                                                                                                 |
| 30. Verification        | 147 passing tests; lint/types, static/server builds, 152-asset validation, production two-browser checks; actual hosted four-client reconnect/leave/host-transfer and duel checks |
| 31. Known limits        | Sustained human balance/latency, cold-start timing and Render profiling pending; details in QA                                                                                    |

The full [architecture/deployment guide](MULTIPLAYER.md) and [QA record](QA-v0.6.md)
separate implemented behavior, measured results and outstanding acceptance work.
No merge or update to either deployed branch is authorized by this candidate.
