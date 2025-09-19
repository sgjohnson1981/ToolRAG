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

### Configuration via JSON File
The ToolRAG MCP server is configured exclusively through a JSON file, controlled by two environment variables.

-   **`TOOLRAG_MCP_CONFIG_PATH`**: The absolute path to your JSON configuration file. If this variable is not set, the server will start, but no downstream tool servers will be launched.

-   **`TOOLRAG_DOWNSTREAM_SERVERS`**: Specifies which servers to launch from the configuration file.
    -   To launch a specific set of servers, provide a comma-separated list of their names (e.g., `"server1,server2,server3"`).
    -   To launch all servers defined in the file, use the special keyword `"all"`.
    -   **Important**: The list must not contain any leading/trailing whitespace or empty entries (e.g., `"server1, ,server2"` is invalid).
    -   If this variable is not set or is an empty string, no servers will be launched.

-   **`MCP_SERVER_RETRY_ATTEMPTS`**: The number of times to retry connecting to a downstream server if it fails on startup. Defaults to `3`.

-   **`MCP_SERVER_RETRY_DELAY_MS`**: The delay in milliseconds between retry attempts. Defaults to `1000`.

#### JSON Configuration Format
The server supports two flexible JSON formats for defining your tool servers.

**1. Object of Objects (Recommended)**

The top-level key must be `mcpServers`. Each key inside this object is the server's unique name.

```json
{
  "mcpServers": {
    "My Server": {
      "command": "python",
      "args": ["server.py", "--verbose", "--port", "8080"],
      "env": {
        "API_KEY": "secret-key"
      }
    },
    "Stripe Tools": {
        "transport": {
            "type": "sse",
            "url": "https://mcp.pipedream.net/token/stripe"
        }
    }
  }
}
```

**2. Array of Objects**

The top-level key must be `servers`. Each object in the array must have a unique `name` property.

```json
{
  "servers": [
    {
      "name": "File Explorer",
      "transport": {
        "type": "stdio",
        "command": "python",
        "args": ["/path/to/file_explorer_server.py"]
      }
    },
    {
      "name": "Stripe Tools",
        "transport": {
            "type": "sse",
            "url": "https://mcp.pipedream.net/token/stripe"
        }
    }
  ]
}
```

#### Example `settings.json` Configuration
To run the server, you should configure your MCP client (e.g., in VS Code's `settings.json`) by setting the environment variables.

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
      // 👇 Set the `cwd` to your local project's root directory
      "cwd": "/path/to/your/toolrag/project",
      "env": {
        "TOOLRAG_MCP_CONFIG_PATH": "/path/to/your/toolservers.json",
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
