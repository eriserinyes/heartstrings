/**
 * Core data model. Everything in `Vault` is encrypted at rest — see
 * src/crypto/vault.ts. Nothing here is ever written to storage in plaintext.
 */

export type Id = string;

export interface Person {
  id: Id;
  name: string;
  emoji: string;
  /** Pastel colour for this person's node. */
  color: string;
  /** Exactly one person may be "me" — the centre of the graph. */
  isMe: boolean;
  notes: string;
  /** Optional pinned position so the layout you arranged sticks around. */
  pin?: { x: number; y: number; z?: number };
  /**
   * Lives on the speculative layer: someone you haven't met, might date, are
   * imagining. Hidden with the layer, along with every connection they have.
   * "Me" is never speculative.
   */
  speculative?: boolean;
}

/** How loudly a type draws on the map. */
export type Emphasis = 'subtle' | 'normal' | 'bold';

export interface RelationshipType {
  id: Id;
  label: string;
  emoji: string;
  color: string;
  /** Dashed lines read as "softer"/unspoken — used for crushes by default. */
  dashed: boolean;
  /** bold = thick glowing line with a heart badge; subtle = thin and faint. */
  emphasis: Emphasis;
  /**
   * Directional types (crush, friendship…) are two independent one-way
   * connections. Non-directional types (partners) only make sense as a shared
   * bond, so each is a single record whose from/to order carries no meaning.
   */
  directed: boolean;
  builtIn: boolean;
}

/**
 * One connection of one type. For a directional type it means "from feels
 * <type> toward to", and mutuality is derived when both directions exist.
 * For a non-directional type it's a single shared bond and from/to order is
 * irrelevant. Multiple types between the same pair coexist independently.
 */
export interface Relationship {
  id: Id;
  from: Id;
  to: Id;
  typeId: Id;
  /** 1–5 hearts; drives line thickness. */
  intensity: number;
  notes: string;
  /** ISO date (yyyy-mm-dd), optional. */
  since: string;
  createdAt: number;
  /**
   * Lives on the "speculative" layer: what-ifs and maybes. Real and speculative
   * connections are fully independent; the whole layer can be hidden as if it
   * didn't exist.
   */
  speculative: boolean;
}

export interface Vault {
  version: 1;
  people: Person[];
  types: RelationshipType[];
  relationships: Relationship[];
  /**
   * Built-in type ids this vault has already been offered. Lets new built-ins
   * appear in old vaults without resurrecting ones the user deleted.
   */
  seededTypeIds?: Id[];
}
