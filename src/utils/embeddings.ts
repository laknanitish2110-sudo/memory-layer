import type { EmbeddingProvider } from "../types.js";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Simple hash-based embedding for local dev/testing — not for production.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(dimensions = 128) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dimensions).fill(0);
    const normalized = text.toLowerCase().trim();
    for (let i = 0; i < normalized.length; i++) {
      const idx = (normalized.charCodeAt(i) * (i + 1)) % this.dimensions;
      vec[idx] += 1;
    }
    const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return mag === 0 ? vec : vec.map((v) => v / mag);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
