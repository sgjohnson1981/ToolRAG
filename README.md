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

// Initialize ToolRAG with MCP servers
const toolRag = await ToolRAG.init({
  mcpServers: [
    "https://mcp.pipedream.net/token/google_calendar",
    "https://mcp.pipedream.net/token/stripe",
    // Add as many tool servers as you need!
  ],
});

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

### Configuration via Environment Variables

You can configure the ToolRAG MCP server to connect to downstream MCP servers using environment variables. This allows you to aggregate multiple tool servers into a single endpoint.

-   **`TOOLRAG_MCP_SERVERS`**: A comma-separated list of downstream MCP server URLs or commands.
    -   For **HTTP servers**, provide the full URL.
    -   For **stdio servers**, use the format `stdio:path/to/executable --with --args`.

-   **`MCP_SERVER_RETRY_ATTEMPTS`**: The number of times to retry connecting to a downstream server if it fails on startup. Defaults to `3`.

-   **`MCP_SERVER_RETRY_DELAY_MS`**: The delay in milliseconds between retry attempts. Defaults to `1000`.

#### Per-Server Retry Configuration

You can override the global retry settings for specific servers by adding query parameters to the URL:

-   `retries`: Overrides `MCP_SERVER_RETRY_ATTEMPTS`.
-   `delay`: Overrides `MCP_SERVER_RETRY_DELAY_MS`.

**Example:**

```
TOOLRAG_MCP_SERVERS="https://mcp.pipedream.net/token/google_calendar?retries=5&delay=2000,stdio:node my-custom-tool.js"
```

In this example, the server will try to connect to the Google Calendar server 5 times with a 2-second delay, while the custom stdio tool will use the default retry settings.

### Example: Launching the Server with a Wrapper Script

If your client (e.g., a VS Code extension) doesn't support setting environment variables directly, you can use a simple wrapper script to launch the server.

**`run.sh` (for Linux and macOS):**

```sh
#!/bin/bash
export TOOLRAG_MCP_SERVERS="https://mcp.pipedream.net/token/google_calendar,https://mcp.pipedream.net/token/stripe"
export MCP_SERVER_RETRY_ATTEMPTS=5
pnpm --filter @antl3x/toolrag start:server
```

**`run.bat` (for Windows):**

```bat
@echo off
set TOOLRAG_MCP_SERVERS="https://mcp.pipedream.net/token/google_calendar,https://mcp.pipedream.net/token/stripe"
set MCP_SERVER_RETRY_ATTEMPTS=5
pnpm --filter @antl3x/toolrag start:server
```

You would then configure your client to execute this script (`/path/to/run.sh` or `C:\path\to\run.bat`) instead of the direct `pnpm` command.

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
