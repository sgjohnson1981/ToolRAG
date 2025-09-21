![toolrag-header](https://github.com/user-attachments/assets/ae45be26-d473-43d3-8432-48d68635a6f5)

<div align="center"><strong>ToolRAG</strong></div>
<div align="center">Infinity LLM tools, zero context conntraints<br />Context-aware tool retrieval for large language models.</div>

# Introduction
ToolRAG provides a seamless solution for using an unlimited number of function definitions with Large Language Models (LLMs), without worrying about context window limitations, costs, or performance degradation.

## 🌟 Key Features

- **Unlimited Tool Definitions**: Say goodbye to context window constraints. ToolRAG dynamically selects only the most relevant tools for each query.
- **Semantic Tool Search**: Uses vector embeddings to find the most contextually relevant tools for a given user query.
- **Cost Optimization**: Reduces token usage by only including the most relevant function definitions.
- **Performance Improvement**: Prevents performance degradation that occurs when overwhelming LLMs with too many function definitions.
- **MCP Integration**: Works with any Model Context Protocol (MCP) compliant servers, enabling access to a wide ecosystem of tools.
- **OpenAI Compatible**: Format tools as OpenAI function definitions for seamless integration.

## 🔍 How It Works

1. **Tool Registration**: ToolRAG connects to MCP servers and registers available tools.
2. **Embedding Generation**: Tool descriptions and parameters are embedded using vector embeddings (OpenAI or Google).
3. **Query Analysis**: When a user query comes in, ToolRAG finds the most relevant tools via semantic search.
4. **Tool Execution**: Execute selected tools against the appropriate MCP servers.

## Installation

```bash
npm install @antl3x/toolrag
# or
yarn add @antl3x/toolrag
# or
pnpm add @antl3x/toolrag
```

## 🚀 Quick Start

```typescript
import { ToolRAG } from "@antl3x/toolrag";
import OpenAI from "openai";

// Initialize ToolRAG
const toolRag = await ToolRAG.init();

const userQuery =
  "What events do I have tomorrow? Also, check my stripe balance.";

// Get relevant tools for a specific query
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-4o",
  input: userQuery,
  tools: await toolRag.listTools(userQuery),
});

// Execute the function calls from the LLM response
for (const call of response.output.filter(
  (item) => item.type === "function_call"
)) {
  const result = await toolRag.callTool(call.name, JSON.parse(call.arguments));
  console.log(result);
}
```

## Running as an MCP Server

In addition to being used as a library, ToolRAG can be run as a standalone MCP server. This allows any MCP-compatible client to connect to it and use its intelligent tool discovery and execution capabilities. The server communicates over `stdio`.

### How to Run the Server

To run the server, use the following command from the root of the repository:

```bash
pnpm --filter @antl3x/toolrag start:server
```

### Exposed Tools

The server exposes the core functionality of ToolRAG as two MCP tools:

-   `listTools`: Finds relevant tools for a given query.
    -   **Input**: `query` (string) - The natural language query to find tools for.
    -   **Output**: A JSON string containing an array of relevant tools in the OpenAI function format.
-   `callTool`: Executes a tool with the given name and arguments.
    -   **Input**: `toolName` (string) - The name of the tool to execute.
    -   **Input**: `input` (object) - The arguments to pass to the tool.
    -   **Output**: The result of the tool execution.

### Exclusive File-Based MCP Server Configuration

The ToolRAG MCP server uses an exclusive file-based configuration system via a JSON file. This approach provides flexibility and ease of management for defining downstream MCP servers. Configuration is controlled by environment variables, and the system ignores any servers marked with `"disabled": true`.

#### Environment Variables for Setup

- **`TOOLRAG_MCP_CONFIG_PATH`**: Specifies the absolute path to the JSON configuration file containing downstream server definitions. If unset or empty, the server starts without launching any downstream servers (no tools available beyond ToolRAG's core functionality).

- **`TOOLRAG_DOWNSTREAM_SERVERS`**: Determines which servers from the JSON file to launch.
  - Use `"all"` to launch every enabled server defined in the file.
  - Provide a comma-separated list of server names (e.g., `"github-server,code-index,memory"`) to launch a specific subset.
  - If unset or empty, no servers are launched from the file.
  - **Note**: Server names must match exactly (case-sensitive), with no leading/trailing whitespace or empty entries in the list.

- **`MCP_SERVER_RETRY_ATTEMPTS`**: Number of retry attempts to connect to a downstream server on startup failure. Defaults to `3`.

- **`MCP_SERVER_RETRY_DELAY_MS`**: Delay in milliseconds between retry attempts. Defaults to `1000`.

#### JSON Configuration Structure

The JSON file supports two formats for defining MCP servers. Servers with `"disabled": true` are automatically ignored and not launched, regardless of the `TOOLRAG_DOWNSTREAM_SERVERS` setting.

**1. Object-of-Objects Format (Recommended)**

The root object must contain a key `"mcpServers"`, where each sub-key is a unique server name, and the value is the server configuration object (optionally including `"disabled": true`).

```json
{
  "mcpServers": {
    "github-server": {
      "transport": {
        "type": "sse",
        "url": "https://github-mcp.example.com/token/github"
      },
      "disabled": false
    },
    "code-index": {
      "command": "uvx",
      "args": ["code-index-mcp"],
      "env": {
        "PROJECT_PATH": "/path/to/project"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "disabled-example": {
      "command": "some-command",
      "disabled": true
    }
  }
}
```

**2. Array-of-Objects Format**

The root object must contain a key `"servers"`, where the value is an array of server objects. Each object requires a unique `"name"` property (optionally including `"disabled": true`).

```json
{
  "servers": [
    {
      "name": "github-server",
      "transport": {
        "type": "sse",
        "url": "https://github-mcp.example.com/token/github"
      },
      "disabled": false
    },
    {
      "name": "code-index",
      "command": "uvx",
      "args": ["code-index-mcp"],
      "env": {
        "PROJECT_PATH": "/path/to/project"
      }
    },
    {
      "name": "memory",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    {
      "name": "disabled-example",
      "command": "some-command",
      "disabled": true
    }
  ]
}
```

#### Launching Servers

- Set `TOOLRAG_MCP_CONFIG_PATH` to your JSON file path (e.g., `/path/to/mcp-servers.json`).
- Set `TOOLRAG_DOWNSTREAM_SERVERS` to `"all"` to launch all non-disabled servers, or a comma-separated list like `"github-server,code-index,memory"` for a subset.
- Disabled servers (e.g., those with `"disabled": true`) are skipped entirely.
- For stdio-based servers (e.g., code-index, memory), the `command` and `args` define how to spawn the process. For SSE-based (e.g., github-server), use the `transport` object with `url`.

#### Example `settings.json` Configuration

Configure your MCP client (e.g., VS Code's `settings.json`) to run ToolRAG with the new system:

```json
{
  "mcp.servers": [
    {
      "name": "ToolRAG Server",
      "command": "pnpm",
      "arguments": [
        "--filter",
        "@antl3x/toolrag",
        "start:server"
      ],
      // Set the cwd to your local project's root directory
      "cwd": "/path/to/your/toolrag/project",
      "env": {
        "TOOLRAG_MCP_CONFIG_PATH": "/path/to/your/mcp-servers.json",
        "TOOLRAG_DOWNSTREAM_SERVERS": "all"
      }
    }
  ]
}
```

## 🏗️ Architecture

ToolRAG uses a Retrieval-Augmented Generation (RAG) approach optimized for tools:

1. **Storage**: LibSQL database to store tool definitions and their vector embeddings
2. **Retrieval**: Cosine similarity search to find the most relevant tools
3. **Execution**: Direct integration with MCP servers for tool execution

## 👨‍💻 Use Cases

- **Multi-tool AI Assistants**: Build assistants that can access hundreds of APIs
- **Enterprise Systems**: Connect to internal tools and services without context limits
- **AI Platforms**: Provide a unified interface for tool discovery and execution

## 🔧 Configuration Options

ToolRAG offers flexible configuration options:

- Multiple embedding providers (OpenAI, Google)
- Customizable relevance thresholds
- Database configuration for persistence

## 📝 License

Apache License 2.0