import type { BuffId } from './buffs';
export interface ItemDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  description: string;
  useTime: number;
  heal?: number;
  buff?: BuffId;
  charges?: number;
  model: 'vial' | 'incense' | 'pouch' | 'charm';
}
export const ITEMS: ItemDef[] = [
  {
    id: 'crimson',
    name: 'Crimson Vial',
    glyph: '†',
    color: '#e99085',
    model: 'vial',
    useTime: 0.8,
    heal: 30,
    description: 'Restore 30 vitality after drinking. Find a safe opening.',
  },
  {
    id: 'water',
    name: 'Quiet Water',
    glyph: '≈',
    color: '#9bcfd9',
    model: 'vial',
    useTime: 0.5,
    buff: 'water',
    description: 'Restore 25 vitality over 8 seconds.',
  },
  {
    id: 'iron',
    name: 'Iron Incense',
    glyph: '♜',
    color: '#acb8bf',
    model: 'incense',
    useTime: 0.4,
    buff: 'iron',
    description: '35% less guard damage for 15 seconds.',
  },
  {
    id: 'oil',
    name: 'Bell Oil',
    glyph: '♧',
    color: '#d9bb7f',
    model: 'vial',
    useTime: 0.45,
    buff: 'oil',
    description: '20% more posture pressure for 12 seconds.',
  },
  {
    id: 'moth',
    name: 'Moth Draught',
    glyph: '⋈',
    color: '#c5a5d7',
    model: 'vial',
    useTime: 0.45,
    buff: 'moth',
    description: '15% faster melee for 12 seconds.',
  },
  {
    id: 'salt',
    name: 'Pilgrim Salt',
    glyph: '✧',
    color: '#e4ded0',
    model: 'pouch',
    useTime: 0.4,
    buff: 'salt',
    description: '30% stronger counter posture pressure for 14 seconds.',
  },
  {
    id: 'ash',
    name: 'Ash Cordial',
    glyph: '⌇',
    color: '#e1a976',
    model: 'vial',
    useTime: 0.45,
    buff: 'ash',
    description: '60% faster ranged recharge for 16 seconds.',
  },
  {
    id: 'glass',
    name: 'Glass Tonic',
    glyph: '◇',
    color: '#e2b1b8',
    model: 'vial',
    useTime: 0.5,
    buff: 'glass',
    description: '+35% damage, +20% incoming damage for 12 seconds.',
  },
  {
    id: 'silver',
    name: 'Silver Powder',
    glyph: '⁂',
    color: '#dcebef',
    model: 'pouch',
    useTime: 0.35,
    charges: 1,
    description: 'Restore one ranged charge. Rare.',
  },
  {
    id: 'ward',
    name: 'Warding Thread',
    glyph: '⌘',
    color: '#bbd5b4',
    model: 'charm',
    useTime: 0.45,
    buff: 'ward',
    description: 'Absorb one hit within 20 seconds. Does not stack.',
  },
];
export interface ItemStack {
  id: string;
  count: number;
}
export class Inventory {
  slots: ItemStack[] = [];
  selected = 0;
  get count(): number {
    return this.slots.reduce((n, s) => n + s.count, 0);
  }
  get item(): ItemDef | undefined {
    return ITEMS.find((i) => i.id === this.slots[this.selected]?.id);
  }
  add(id: string): boolean {
    if (!ITEMS.some((i) => i.id === id) || this.count >= 5) return false;
    const stack = this.slots.find((s) => s.id === id);
    if (stack && stack.count >= 2) return false;
    if (stack) stack.count++;
    else this.slots.push({ id, count: 1 });
    return true;
  }
  take(): ItemDef | undefined {
    const item = this.item;
    if (!item) return;
    if (--this.slots[this.selected].count === 0) this.slots.splice(this.selected, 1);
    this.selected = Math.min(this.selected, Math.max(0, this.slots.length - 1));
    return item;
  }
  cycle(direction: number): void {
    if (this.slots.length)
      this.selected = (this.selected + direction + this.slots.length) % this.slots.length;
  }
  clear(): void {
    this.slots = [];
    this.selected = 0;
  }
}
