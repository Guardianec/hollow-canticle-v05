import type { Client } from 'colyseus';
import { FriendRoom } from './FriendRoom';
export class DuelRoom extends FriendRoom {
  readonly mode = 'duel' as const;
  maxClients = 2;
  private rematches = new Set<string>();
  private decidingAt?: number;
  messages = {
    ...this.commonMessages,
    rematch: (client: Client) => {
      if (this.state.phase !== 'matchEnd') return;
      this.rematches.add(client.sessionId);
      if (this.rematches.size !== 2 || this.state.players.size !== 2) return;
      this.rematches.clear();
      this.game = undefined;
      this.state.phase = 'lobby';
      this.state.winner = '';
      for (const player of this.state.players.values()) {
        player.ready = false;
        player.score = 0;
      }
    },
  };
  begin(): void {
    this.decidingAt = undefined;
    this.state.phase = 'countdown';
    this.state.countdown = 3;
  }
  acceptsInput(): boolean {
    return (
      this.state.phase === 'round' && [...this.state.players.values()].every((p) => p.connected)
    );
  }
  advance(dt: number): void {
    if (!this.game) return;
    if (this.state.players.size < 2) {
      this.state.phase = 'matchEnd';
      this.state.winner = this.state.players.keys().next().value ?? '';
      return;
    }
    if ([...this.state.players.values()].some((p) => !p.connected)) return;
    if (this.state.phase === 'countdown' || this.state.phase === 'roundEnd') {
      this.state.countdown = Math.max(0, this.state.countdown - dt);
      if (this.state.countdown <= 0) {
        if (this.state.phase === 'roundEnd') {
          this.game.resetDuel();
          this.begin();
        } else this.state.phase = 'round';
      }
      return;
    }
    if (this.state.phase !== 'round') return;
    this.game.step(dt);
    const alive = [...this.game.members.values()].filter((m) => m.world.player.hp > 0);
    if (alive.length === 2) {
      this.decidingAt = undefined;
      return;
    }
    this.decidingAt ??= this.game.time;
    // Let an already-in-flight defensive input resolve before awarding the round.
    if (this.game.time - this.decidingAt < 0.25) return;
    const winner = alive[0];
    if (winner) winner.score++;
    this.state.winner = winner?.id ?? '';
    this.state.phase = winner && winner.score >= 3 ? 'matchEnd' : 'roundEnd';
    this.state.countdown = 2;
    this.game.projectiles.clear();
    this.broadcast('event', { type: 'roundEnd', x: 560, y: 380 });
  }
}
