// Shared deterministic PRNG (mulberry32) — seed-stable, reproducible across all optimization modules.
// All optimization files import from here instead of duplicating the implementation.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform: draws a standard normal from a uniform [0,1) PRNG.
export function gaussFrom(rand: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
