// Tekrar üretilebilir rastgelelik: her maç (tohum, maç kimliği, tekrar sayacı) üçlüsünden kendi akışını alır.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a tabanlı dize özeti. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rngFor(seed: number, key: string, nonce = 0): Rng {
  return mulberry32(hashString(`${seed}|${key}|${nonce}`));
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}
