import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { withMcpAuth } from "better-auth/plugins";
import type { AppContext } from "@server/app";
import { createMcpServer } from "@server/mcp/server";

// The transport reports protocol errors by throwing, but they are answers like any other and are recorded
const answerRequest = async (
  transport: StreamableHTTPTransport,
  context: Context,
) => {
  try {
    const answered = await transport.handleRequest(context);

    return answered ?? new Response(null, { status: 202 });
  } catch (error) {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }

    throw error;
  }
};

export const mcpController = new Hono<AppContext>()
  .post("/", (context) => {
    const services = context.get("services");

    const handle = withMcpAuth(
      context.get("context").auth,
      async (request, session) => {
        await services.mcp.assertAccess(session);

        // Stateless: every request gets its own server, so nothing is held between calls
        const server = createMcpServer(services);
        const transport = new StreamableHTTPTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);

        const startedAt = Date.now();
        const requestBody = await request.clone().text();
        const response = await answerRequest(transport, context);
        const responseBody = await response.clone().text();

        await services.mcp.recordRequest({
          clientId: session.clientId,
          userId: session.userId,
          requestBody,
          responseBody,
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
        });

        return response;
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
