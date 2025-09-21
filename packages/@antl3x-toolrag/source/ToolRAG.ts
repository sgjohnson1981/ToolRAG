import type { Client as LibSQLClient } from '@libsql/client';
import { createClient } from '@libsql/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { log } from '@utils.js';
import crypto from 'crypto';
import fs from 'fs';
import { Tool as OpenAITool } from 'openai/src/resources/responses/responses.js';
import { z } from 'zod';
import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { EmbeddingProviderCohere } from './EmbeddingProviderCohere.js';
import { EmbeddingProviderGoogle } from './EmbeddingProviderGoogle.js';
import { EmbeddingProviderOllama } from './EmbeddingProviderOllama.js';
import { EmbeddingProviderOpenAI } from './EmbeddingProviderOpenAI.js';
import { setupConfig, ToolRAGConfig, ToolRAGConfigInput } from './ToolRAGConfig';

const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()).optional(),
  }),
});

type MCPTool = z.infer<typeof mcpToolSchema>;

// Define the structure for a single server configuration
interface ServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: {
    type: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
  };
  disabled?: boolean;
}

class ToolRAG {
  private _mcpClients: Client[] = [];
  private _mcpTools: MCPTool[] = [];
  private _toolToClientMap: Map<string, Client> = new Map();
  private _embeddingProvider: EmbeddingProvider | null = null;
  private _db: LibSQLClient | null = null;
  private _config: ToolRAGConfig;
  private _log = log('toolreg:ToolRAG');
  private _db_table_name = () => `tool_embeddings_${this._embeddingProvider?.getName()}`;

  constructor(config?: ToolRAGConfigInput) {
    this._config = setupConfig(config);
  }

  static async init(config?: ToolRAGConfigInput) {
    const toolRAG = new ToolRAG(config);
    await toolRAG._initEmbeddingProvider();
    await toolRAG._initDatabase();
    await toolRAG._initMcpServers();
    toolRAG._log.info('ToolRAG initialized');
  
    return toolRAG;
  }

  private _initEmbeddingProvider() {
    const providerConfig = this._config.embeddingProvider;

    if (typeof providerConfig === 'string') {
      switch (providerConfig) {
        case 'openai':
          this._embeddingProvider = new EmbeddingProviderOpenAI();
          break;
        case 'google':
          this._embeddingProvider = new EmbeddingProviderGoogle();
          break;
        case 'ollama':
          this._embeddingProvider = new EmbeddingProviderOllama();
          break;
        case 'cohere':
          this._embeddingProvider = new EmbeddingProviderCohere();
          break;
        default:
          throw new Error(`Unsupported embedding provider: ${providerConfig}`);
      }
    } else {
      this._embeddingProvider = providerConfig;
    }
  }

  private async _initMcpServers() {
    const configPath = process.env.TOOLRAG_MCP_CONFIG_PATH;
    if (!configPath) {
      this._log.info('TOOLRAG_MCP_CONFIG_PATH not set, skipping MCP server initialization.');
      return;
    }

    if (!fs.existsSync(configPath)) {
      console.error(`Error: Configuration file not found at ${configPath}`);
      process.exit(1);
    }

    const serversToLaunch = this._getServerListFromEnv();
    if (serversToLaunch.length === 0) {
      return; // Nothing to do
    }

    const allServers = this._loadAndNormalizeConfig(configPath);
    const selectedServers = new Map<string, ServerConfig>();

    if (serversToLaunch[0] === 'all') {
      // Launch all servers from the config file
      for (const [name, config] of allServers.entries()) {
        selectedServers.set(name, config);
      }
      this._log.info('Initializing all servers from config file...');
    } else {
      // Launch a specific subset of servers
      for (const name of serversToLaunch) {
        if (!allServers.has(name)) {
          console.error(`Error: Server "${name}" requested but not defined in config file.`);
          process.exit(1);
        }
        selectedServers.set(name, allServers.get(name)!);
      }
      this._log.info(`Initializing selected servers: ${serversToLaunch.join(', ')}`);
    }

    this._log.info(`Initializing with ${selectedServers.size} MCP servers (ignoring disabled flag)`);
    await Promise.all(
      Array.from(selectedServers.entries()).map(([name, config]) =>
        this._registerMcpServer(name, config)
      )
    );
  }

  private _getServerListFromEnv(): string[] {
    const serversEnv = process.env.TOOLRAG_DOWNSTREAM_SERVERS;
    if (!serversEnv) {
      this._log.info('TOOLRAG_DOWNSTREAM_SERVERS not set, no servers will be launched.');
      return [];
    }

    const serverNames = serversEnv.split(',');

    // Validate names: no trailing spaces, no empty entries
    for (const name of serverNames) {
      if (name.trim() !== name) {
        console.error(`Error: Server name "${name}" in TOOLRAG_DOWNSTREAM_SERVERS contains leading/trailing whitespace.`);
        process.exit(1);
      }
      if (name === '') {
        console.error('Error: TOOLRAG_DOWNSTREAM_SERVERS contains an empty server name.');
        process.exit(1);
      }
    }

    return serverNames;
  }

  private _loadAndNormalizeConfig(configPath: string): Map<string, ServerConfig> {
    const configFileContent = fs.readFileSync(configPath, 'utf-8');
    const configJson = JSON.parse(configFileContent);
    const normalizedServers = new Map<string, ServerConfig>();
  
    if (typeof configJson === 'object' && configJson !== null && !Array.isArray(configJson)) {
      // Direct object format: { "server1": {...}, ... }
      for (const [name, config] of Object.entries(configJson)) {
        normalizedServers.set(name, config as ServerConfig);
      }
    } else if (Array.isArray(configJson)) {
      // Direct array format: [ {name: "server1", ...}, ... ]
      for (const server of configJson) {
        if (server.name && typeof server.name === 'string') {
          normalizedServers.set(server.name, server as ServerConfig);
        } else {
          console.error('Error: Each server in array format must have a "name" property.');
          process.exit(1);
        }
      }
    } else {
      console.error('Error: Configuration file must be an object { "server": {...} } or array [ {name: "server", ...} ].');
      process.exit(1);
    }
  
    return normalizedServers;
  }

  private async _registerMcpServer(name: string, config: ServerConfig) {
    // Default retry settings
    const retryAttempts = parseInt(process.env.MCP_SERVER_RETRY_ATTEMPTS || '3', 10);
    const retryDelay = parseInt(process.env.MCP_SERVER_RETRY_DELAY_MS || '1000', 10);

    const client = new Client({ name, version: '0' });

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const transportType = config.transport?.type;
        if (transportType === 'stdio' && config.transport?.command) {
          const transport = new StdioClientTransport({
            command: config.transport.command,
            args: config.transport.args,
            env: config.env,
          });
          await client.connect(transport);
        } else if (transportType === 'sse' && config.transport?.url) {
          const transport = new SSEClientTransport(new URL(config.transport.url));
          await client.connect(transport);
        } else if (config.command) { // Legacy stdio format
          const transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env,
          });
          await client.connect(transport);
        } else {
          throw new Error(`Invalid transport configuration for server "${name}"`);
        }

        this._mcpClients.push(client);
        const res = await client.listTools();
        this._log.info(`Found ${res.tools.length} tools from ${name}`);
        this._log.info(res.tools.map((tool) => tool.name).join(', '));

        for (const tool of res.tools) {
          this._toolToClientMap.set(tool.name, client);
        }

        this._mcpTools.push(...res.tools);
        await this._refreshToolsEmbeddings();
        return; // Success, exit the loop
      } catch (error) {
        this._log.error(`Attempt ${attempt}/${retryAttempts} failed for ${name}:`, error);
        if (attempt < retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.error(`Failed to connect to downstream server ${name} after ${retryAttempts} attempts. Skipping.`);
        }
      }
    }
  }

  private _hashTool(tool: MCPTool): string {
    return crypto.createHash('sha256').update(JSON.stringify(tool)).digest('hex');
  }

  private _ensureInitialized() {
    if (!this._db) throw new Error('Database not initialized');
    if (!this._embeddingProvider) throw new Error('Embedding provider not initialized');
  }

  async _initDatabase() {
    try {
      this._db = createClient({
        url: this._config.database.url,
      });
      const dimensions = this._embeddingProvider?.getDimensions();
      const tableName = this._db_table_name();

      await this._db.execute(
        `CREATE TABLE IF NOT EXISTS ${tableName} (
          id INTEGER PRIMARY KEY,
          tool_name TEXT NOT NULL,
          tool_hash TEXT NOT NULL,
          embedding F32_BLOB(${dimensions}) NOT NULL,
          embedding_text TEXT NOT NULL,
          tool_json TEXT NOT NULL
        )`,
        []
      );

      await this._db.execute(
        `CREATE INDEX IF NOT EXISTS idx_tool_hash ON ${tableName}(tool_hash)`,
        []
      );

      await this._db.execute(
        `CREATE INDEX IF NOT EXISTS idx_tool_embeddings_vector
        ON ${tableName}(libsql_vector_idx(embedding))`,
        []
      );

      this._log.info(`Database initialized at ${this._config.database.url}`);
    } catch (error) {
      this._log.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private _formatToolText(tool: MCPTool): string {
    const params = tool.inputSchema.properties
      ? Object.entries(tool.inputSchema.properties)
          .map(
            ([name, schema]: [string, any]) =>
              `    ${name} [${schema.type}]: ${schema?.description || ''}`
          )
          .join('\n')
      : '';

    const toolName = tool.name.replaceAll(/-|_/g, ' ');
    return `${toolName}: ${tool?.description || ''}\n${params}`;
  }

  async _generateToolsEmbeddings(tools: MCPTool[]) {
    this._ensureInitialized();

    // Generate text and embeddings for each tool
    return await Promise.all(
      tools.map(async (tool) => {
        const toolText = this._formatToolText(tool);
        const embedding = await this._embeddingProvider!.getEmbedding(toolText);

        return {
          tool,
          toolName: tool.name,
          toolHash: this._hashTool(tool),
          embedding,
          toolText,
        };
      })
    );
  }

  private async _refreshToolsEmbeddings() {
    this._ensureInitialized();
    this._log.info('Checking for new or updated tools...');

    // Find tools that need updating
    const tableName = this._db_table_name();
    const toolsWithHashes = this._mcpTools.map((tool) => ({
      tool,
      hash: this._hashTool(tool),
    }));

    const dbToolsResult = await this._db!.execute(
      `SELECT tool_name FROM ${tableName}`,
      []
    );

    const hashSet = new Set(dbToolsResult.rows.map((row) => row.tool_name as string));
    const toolsToUpdate = toolsWithHashes.filter(({ tool }) => !hashSet.has(tool.name));

    if (toolsToUpdate.length === 0) {
      this._log.info('All tools are up-to-date, no new embeddings needed');
      return [];
    }

    this._log.info(`Generating embeddings for ${toolsToUpdate.length} new or updated tools...`);
    const newEmbeddings = await this._generateToolsEmbeddings(
      toolsToUpdate.map(({ tool }) => tool)
    );

    try {
      // Process each new embedding
      for (const { toolName, toolText, toolHash, embedding, tool } of newEmbeddings) {
        const toolJson = JSON.stringify(tool);
        const embeddingBuffer = new Float32Array(embedding).buffer;

        // Try update first, then insert if not exists
    const updateResult = await this._db!.execute(
      `UPDATE ${tableName}
                SET tool_hash = ?, embedding = ?, tool_json = ?, embedding_text = ?
                WHERE tool_name = ?`,
      [toolHash, embeddingBuffer, toolJson, toolText, toolName]
    );

        if (!updateResult.rowsAffected) {
      await this._db!.execute(
        `INSERT INTO ${tableName}
                  (tool_name, tool_hash, embedding, tool_json, embedding_text)
                  VALUES (?, ?, ?, ?, ?)`,
        [toolName, toolHash, embeddingBuffer, toolJson, toolText]
      );
        }
      }

      this._log.info(`Successfully updated embeddings for ${newEmbeddings.length} tools`);
      return newEmbeddings;
    } catch (error) {
      this._log.error('Error updating embeddings:', error);
      throw error;
    }
  }

  async _pruneMissingTools() {
    this._ensureInitialized();
    this._log.info('Pruning missing tools from database...');

    try {
      const tableName = this._db_table_name();

      // Find tools to remove
    const existingHashes = await this._db!.execute(
      `SELECT tool_name FROM ${this._db_table_name()}`,
      []
    );

      const dbToolNames = existingHashes.rows.map((row) => row.tool_name as string);
      const currentToolNames = this._mcpTools.map((tool) => tool.name);
      const toolsToRemove = dbToolNames.filter((name) => !currentToolNames.includes(name));

      if (toolsToRemove.length === 0) {
        this._log.info('No tools to prune, database is in sync');
        return 0;
      }

      // Remove tools in a single transaction
      this._log.info(`Found ${toolsToRemove.length} tools to remove from database`);

      for (const toolName of toolsToRemove) {
      await this._db!.execute({
        sql: `DELETE FROM ${tableName} WHERE tool_name = ?`,
        args: [toolName],
      });
      }

      this._log.info(`Successfully pruned ${toolsToRemove.length} tools`);
      return toolsToRemove.length;
    } catch (error) {
      this._log.error('Error pruning missing tools:', error);
      throw error;
    }
  }

  async _findSimilarToolsByVector(query: string) {
    this._ensureInitialized();

    // Generate embedding for the query
    const queryEmbedding = await this._embeddingProvider!.getEmbedding(query);
    const queryEmbeddingBuffer = new Float32Array(queryEmbedding).buffer;
    const tableName = this._db_table_name();

    // Use vector search
    const result = await this._db!.execute(
      `
        SELECT te.id, te.tool_name, te.tool_json,
               vector_distance_cos(te.embedding, ?) as distance
        FROM vector_top_k('idx_tool_embeddings_vector', ?, 40) AS vt
        JOIN ${tableName} te ON te.id = vt.id
      `,
      [queryEmbeddingBuffer, queryEmbeddingBuffer]
    );

    this._log.info(`Found ${result.rows.length} similar tools via vector search`);

    // Transform results
    return result.rows.map((row) => ({
      toolName: row.tool_name as string,
      relevance: 1 - (row.distance as number),
      tool: JSON.parse(row.tool_json as string),
    }));
  }

  private _convertToOpenAIFunction(
    tool: MCPTool,
    relevance: number
  ): OpenAITool & { relevance: number } {
    return {
      type: 'function',
      name: tool.name,
      description: tool.description || '',
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties || {},
        required: Object.entries(tool.inputSchema.properties || {})
          .filter(([_, schema]: [string, any]) => !schema.optional)
          .map(([key]) => key),
        additionalProperties: false,
      },
      strict: true,
      relevance,
    };
  }

  async listTools(query: string, options?: { relevanceThreshold?: number }): Promise<OpenAITool[]> {
    const { relevanceThreshold = 0.15 } = options || {};
    this._ensureInitialized();

    // Check if we have tools in the database
    const countResult = await this._db!.execute(
      `SELECT COUNT(*) as count FROM ${this._db_table_name()}`,
      []
    );
    const toolCount = (countResult.rows[0]?.count as number) || 0;

    if (toolCount === 0) {
      this._log.warn('No tool embeddings found in database, storing them now');
      await this._refreshToolsEmbeddings();
    }

    // Find similar tools
    const similarTools = await this._findSimilarToolsByVector(query);

    // Filter by relevance and convert to OpenAI format
    return similarTools
      .filter(({ relevance }) => relevance >= relevanceThreshold)
      .map(({ tool, relevance }) => this._convertToOpenAIFunction(tool, relevance));
  }

  async callTool(toolName: string, input: any) {
    this._ensureInitialized();

    const tool = this._mcpTools.find((t) => t.name === toolName);
    if (!tool) {
      throw new McpError(-32601, `Tool ${toolName} not found`);
    }

    const client = this._toolToClientMap.get(toolName);
    if (!client) {
      throw new McpError(-32603, `MCP client for tool ${toolName} not found`);
    }

    try {
      const res = await client.callTool({
        name: toolName,
        arguments: input,
      });
      return res;
    } catch (error: any) {
      this._log.error(`Error calling tool ${toolName} on downstream server:`, error);
      // Re-throw as a standard MCP error to be propagated to the client
      throw new McpError(-32603, `Downstream server error calling tool ${toolName}: ${error.message}`);
    }
  }
}

export default ToolRAG;
