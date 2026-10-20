// Human descriptions of database records (labels show subtype + primary color).

import type { Item } from './types';
import { typeOf } from './taxonomy';
import { cap } from './naming';

export function itemTitle(item: Item): string {
  const color = item.colors[0] ? cap(item.colors[0]) : null;
  const label = typeOf(item.subtype).label;
  return color ? `${color} ${label.toLowerCase()}` : label;
}

export function wearCloser(count: number, lastWornAt: number | null): string {
  if (count === 0) return 'not worn yet';
  const days = lastWornAt ? Math.floor((Date.now() - lastWornAt) / 86_400_000) : null;
  if (days !== null && days <= 0) return `worn ${count}× · today`;
  if (days === 1) return `worn ${count}× · yesterday`;
  if (days !== null && days < 30) return `worn ${count}× · ${days}d ago`;
  return `worn ${count}×`;
}
