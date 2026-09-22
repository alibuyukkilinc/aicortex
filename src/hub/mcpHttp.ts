import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import { buildMcpServer } from "../mcp/server.js";
import type { McpApi } from "../mcp/client.js";
import { CortexError } from "../core/types.js";

// MCP over HTTP, so an AI that does not run on this machine (ChatGPT, a hosted agent, a teammate's tool)
// can use the same tools as a local one. Stateless: every request gets its own server and transport,
// and the agent's token decides its role and what it sees, exactly as in REST.
export function registerMcpHttp(app: FastifyInstance, apiFor: (project: string, token: string) => McpApi): void {
  app.post("/mcp/p/:project", async (req, reply) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      throw new CortexError("unauthorized", "Send 'Authorization: Bearer <agent token>'.", 401);
    }
    const { project } = req.params as { project: string };
    const server = buildMcpServer(apiFor(project, auth.slice(7)));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
    reply.hijack(); // the transport wrote the response itself
  });

  // The spec lets clients open a stream or end a session; stateless mode has neither.
  for (const method of ["get", "delete"] as const) {
    app[method]("/mcp/p/:project", async (_req, reply) =>
      reply.code(405).send({ jsonrpc: "2.0", error: { code: -32000, message: "This endpoint is stateless: send JSON-RPC with POST." }, id: null }),
    );
  }
}
