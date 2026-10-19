import { initContext } from "./context";
import { Services } from "./services";

const ADMIN = {
  email: "admin@example.com",
  password: "dev-admin-password",
};

const run = async () => {
  const context = await initContext();
  const services = new Services({ context });

  const isSetupDone = await services.platformSetup.checkSetup();
  if (isSetupDone) {
    console.log("Setup already completed, skipping admin creation.");
  } else {
    await services.platformSetup.setup({
      email: ADMIN.email,
      name: ADMIN.email,
      password: ADMIN.password,
    });
    console.log(`Admin created: ${ADMIN.email}`);
  }

  await context.queueHub.close();
  await context.eventBus.close();
  await context.rateLimiter.close();
  await context.repositories.close();
};

if (import.meta.main) {
  await run();
  process.exit(0);
}
