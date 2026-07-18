import { initServer } from "./server";

const server = await initServer();

server.serve();

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
