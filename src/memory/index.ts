import type {
  EmbeddingProvider,
  MemoryLayerConfig,
  StorageAdapter,
} from "../types.js";
import { InMemoryStorage } from "../storage/index.js";
import { LocalEmbeddingProvider } from "../utils/embeddings.js";
import { ShortTermMemory } from "./short-term.js";
import { LongTermMemory } from "./long-term.js";
import { SemanticMemory } from "./semantic.js";

export class MemoryLayer {
  readonly shortTerm: ShortTermMemory;
  readonly longTerm: LongTermMemory;
  readonly semantic: SemanticMemory;
  readonly storage: StorageAdapter;
  readonly embedding: EmbeddingProvider;

  constructor(config: MemoryLayerConfig = {}) {
    this.storage = config.storage ?? new InMemoryStorage();
    this.embedding = config.embedding ?? new LocalEmbeddingProvider();

    this.shortTerm = new ShortTermMemory(
      this.storage,
      config.defaultTTL ?? 3600,
    );
    this.longTerm = new LongTermMemory(
      this.storage,
      config.defaultNamespace ?? "default",
    );
    this.semantic = new SemanticMemory(
      this.storage,
      this.embedding,
      "semantic",
    );
  }
}

export { ShortTermMemory } from "./short-term.js";
export { LongTermMemory } from "./long-term.js";
export { SemanticMemory } from "./semantic.js";
