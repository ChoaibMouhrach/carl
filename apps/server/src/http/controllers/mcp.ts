import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { withMcpAuth } from "better-auth/plugins";
import type { AppContext } from "@server/app";
import { createMcpServer } from "@server/mcp/server";

export const mcpController = new Hono<AppContext>()
  .post("/", (context) => {
    const services = context.get("services");

    const handle = withMcpAuth(
      context.get("context").auth,
      async (request, session) => {
        await services.mcp.assertAccess(session);

        // Stateless: every request gets its own server, so nothing is held between calls
        const server = createMcpServer(services);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);

        return await transport.handleRequest(request);
      },
    );

    return handle(context.req.raw);
  })

  // Stateless server: there is no session to resume and no stream to keep open
  .all("/", (context) => {
    context.header("Allow", "POST");

    return context.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      },
      405,
    );
  });
