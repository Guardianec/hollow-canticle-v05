import { FriendRoom } from './FriendRoom';
export class CoopRoom extends FriendRoom {
  readonly mode = 'coop' as const;
  maxClients = 4;
  begin(): void {
    this.state.phase = 'playing';
  }
  acceptsInput(): boolean {
    return this.state.phase === 'playing';
  }
  advance(dt: number): void {
    if (!this.acceptsInput() || !this.game) return;
    this.game.step(dt);
    if (this.game.ended) this.state.phase = 'summary';
  }
}
