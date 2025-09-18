import { Ollama } from 'ollama';
import { EmbeddingProvider } from './EmbeddingProvider.js';
import { z } from 'zod';

const EmbeddingProviderOllamaConfigSchema = z
  .object({
    model: z.string().default('qwen2:0.5b'),
    host: z.string().default('http://localhost:11434'),
    client: z.instanceof(Ollama).optional(),
  })
  .default({});

type EmbeddingProviderOllamaConfig = z.infer<typeof EmbeddingProviderOllamaConfigSchema>;

/**
 * Ollama implementation of the EmbeddingProvider
 */
export class EmbeddingProviderOllama implements EmbeddingProvider {
  private _client: Ollama;
  private _config: EmbeddingProviderOllamaConfig;

  constructor(config?: EmbeddingProviderOllamaConfig) {
    this._config = EmbeddingProviderOllamaConfigSchema.parse(config);
    this._client = this._config.client || new Ollama({ host: this._config.host });
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await this._client.embeddings({
      model: this._config.model,
      prompt: text,
    });

    return response.embedding;
  }

  getDimensions(): number {
    // Dimension for qwen2:0.5b is 896
    // This might need to be dynamic if other models are used.
    // For now, hardcoding is fine as per the current implementation pattern.
    return 896;
  }

  getName(): string {
    return `ollama`;
  }

  getModel(): string {
    return this._config.model;
  }
}
