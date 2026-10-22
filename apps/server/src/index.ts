import { initServer } from "./server";

const server = await initServer();

server.serve();

const shutdown = async () => {
  await server.logger.info("Shutting down.");
  await server.close();
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
process.on("unhandledRejection", (reason) => {
  void server.logger.error("Unhandled promise rejection.", reason);
});
process.on("uncaughtException", (error) => {
  void server.logger.error("Uncaught exception, exiting.", error);
  process.exit(1);
});
