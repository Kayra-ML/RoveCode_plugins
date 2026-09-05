import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

async function main() {
  const { server, personal } = await createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Cleanup on exit
  process.on("SIGINT", () => {
    personal.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    personal.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});