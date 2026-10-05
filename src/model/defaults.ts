import type { RelationshipType, Vault } from './types';

export const DEFAULT_TYPES: RelationshipType[] = [
  { id: 'friend', label: 'Friendship', emoji: '🌼', color: '#3fbfa8', dashed: false, emphasis: 'normal', builtIn: true },
  { id: 'acquaintance', label: 'Acquaintance', emoji: '👋', color: '#a29bc4', dashed: false, emphasis: 'subtle', builtIn: true },
  { id: 'crush', label: 'Crush', emoji: '💘', color: '#ff7eb6', dashed: true, emphasis: 'normal', builtIn: true },
  { id: 'primary', label: 'Primary partner', emoji: '💖', color: '#ff1f8f', dashed: false, emphasis: 'bold', builtIn: true },
  { id: 'romantic', label: 'Romantic', emoji: '💞', color: '#ff4f6d', dashed: false, emphasis: 'normal', builtIn: true },
  { id: 'play', label: 'Play partner', emoji: '🔥', color: '#9a6bff', dashed: false, emphasis: 'normal', builtIn: true },
  { id: 'qpr', label: 'Queerplatonic', emoji: '🌈', color: '#ffa94d', dashed: false, emphasis: 'normal', builtIn: true },
];

/** The built-ins that shipped in v1, before seededTypeIds existed. */
export const V1_TYPE_IDS = ['friend', 'crush', 'romantic', 'play', 'qpr'];

/** Types counted as "partners" for metamour detection. */
export const PARTNER_TYPE_IDS = new Set(['primary', 'romantic', 'play', 'qpr']);

export const PERSON_EMOJI = [
  '🦊', '🐰', '🐸', '🐱', '🐻', '🦄', '🐙', '🦋', '🐝', '🐧', '🦉', '🐢',
  '🌸', '🌻', '🍄', '🌙', '⭐', '🍓', '🍑', '🧁', '🎀', '🪐', '🌊', '🔮',
];

export const TYPE_EMOJI = ['💖', '👋', '🌼', '💘', '💞', '🔥', '🌈', '💜', '🤝', '🫶', '✨', '🏡', '🎲', '🧸', '⛓️', '🌶️', '💍', '🌱'];

export const TYPE_COLORS = [
  '#3fbfa8', '#ff7eb6', '#ff4f6d', '#9a6bff', '#ffa94d',
  '#4dabf7', '#69db7c', '#f783ac', '#e599f7', '#ffd43b', '#a9e34b', '#868e96',
];

export const PERSON_COLORS = [
  '#ffb3c7', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff',
  '#f4a7b9', '#b8e0d2', '#d6eadf', '#eac4d5',
];

export const ME_COLOR = '#ffd166';

export function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

export function emptyVault(): Vault {
  return {
    version: 1,
    people: [],
    types: DEFAULT_TYPES.map((t) => ({ ...t })),
    relationships: [],
    seededTypeIds: DEFAULT_TYPES.map((t) => t.id),
  };
}

export function newId(): string {
  return crypto.randomUUID();
}
