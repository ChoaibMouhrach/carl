import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { streamSSE } from "hono/streaming";
import type { AppContext } from "@server/app";
import { EVENT_STREAM_HEARTBEAT_MS } from "@server/config/constants";
import { adminMiddleware } from "../middlewares/auth";

export const eventController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get("/", describeRoute({ tags: ["event"] }), (context) => {
    const services = context.get("services");

    context.header("X-Accel-Buffering", "no");

    return streamSSE(context, async (stream) => {
      let wake = () => {};

      const unsubscribe = services.event.subscribe((type) => {
        void stream.writeSSE({ event: type, data: "{}" });
      });

      stream.onAbort(() => {
        unsubscribe();
        wake();
      });

      // Lets the client tell a first connection from a reconnect
      await stream.writeSSE({ event: "ready", data: "{}" });

      while (!stream.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, EVENT_STREAM_HEARTBEAT_MS);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });

        if (!stream.aborted) {
          await stream.writeSSE({ event: "ping", data: "{}" });
        }
      }
    });
  });
