import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import ToolRAG from "./ToolRAG.js";

async function main() {
  console.error("Starting ToolRAG MCP Server...");

  // Initialize ToolRAG
  console.error("Initializing ToolRAG...");
  const toolRag = await ToolRAG.init();
  console.error("ToolRAG initialized.");

  const server = new McpServer({
    name: "toolrag-mcp-server",
    version: "0.1.0",
  });

  // Register the `listTools` tool using the older .tool() method
  server.tool(
    "listTools",
    {
      query: z.string().describe("The natural language query to find tools for."),
    },
    async ({ query }) => {
      console.error(`Received listTools request with query: "${query}"`);
      const tools = await toolRag.listTools(query);
      console.error(`Found ${tools.length} relevant tools.`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(tools, null, 2),
        }],
      };
    }
  );

  // Register the `callTool` tool using the older .tool() method
  server.tool(
    "callTool",
    z.object({
      toolName: z.string().describe("The name of the tool to execute."),
      input: z.any().describe("The arguments to pass to the tool."),
    }),
    async (params) => {
      console.error(`Received callTool request for tool: "${params.toolName}"`);
      const result = await toolRag.callTool(params.toolName, params.input);
      console.error(`Tool "${params.toolName}" executed successfully.`);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("ToolRAG MCP Server is running and connected via stdio.");
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
