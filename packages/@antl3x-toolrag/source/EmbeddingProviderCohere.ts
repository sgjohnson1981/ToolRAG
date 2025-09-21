import { CohereClient } from 'cohere-ai';
import { EmbeddingProvider } from './EmbeddingProvider.js';
import { z } from 'zod';

const EmbeddingProviderCohereConfigSchema = z
  .object({
    model: z.string().default('embed-english-v3.0'),
    client: z.instanceof(CohereClient).optional(),
  })
  .default({});

type EmbeddingProviderCohereConfig = z.infer<typeof EmbeddingProviderCohereConfigSchema>;

/**
 * Cohere implementation of the EmbeddingProvider
 */
export class EmbeddingProviderCohere implements EmbeddingProvider {
  private _client: CohereClient;
  private _config: EmbeddingProviderCohereConfig;

  constructor(config?: EmbeddingProviderCohereConfig) {
    this._config = EmbeddingProviderCohereConfigSchema.parse(config);

    if (this._config.client) {
      this._client = this._config.client;
    } else {
      if (!process.env.COHERE_API_KEY) {
        throw new Error('COHERE_API_KEY environment variable not set');
      }
      this._client = new CohereClient({
        token: process.env.COHERE_API_KEY,
      });
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await this._client.embed({
      texts: [text],
      model: this._config.model,
      inputType: 'search_document', // Recommended for RAG
    });

    if (Array.isArray(response.embeddings)) {
      return response.embeddings[0] as number[];
    } else {
      return response.embeddings as number[];
    }
  }

  getDimensions(): number {
    // Dimension for embed-english-v3.0 is 1024
    // This might need to be dynamic for other models.
    return 1024;
  }

  getName(): string {
    return `cohere`;
  }

  getModel(): string {
    return this._config.model;
  }
}
