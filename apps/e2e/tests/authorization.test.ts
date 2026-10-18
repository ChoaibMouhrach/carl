import { test, expect } from "../fixtures";
import { seedConfig } from "../config";

test("rejects public sign-up requests and creates no account", async ({
  request,
}) => {
  const config = seedConfig();
  const email = `e2e-signup-${crypto.randomUUID()}@example.com`;

  const response = await request.post(
    `${config.apiUrl}/api/auth/sign-up/email`,
    {
      data: { email, name: "Stranger", password: "Test1234@@" },
      headers: { Origin: config.webOrigin },
    },
  );

  expect(response.status()).toBe(404);

  const signIn = await request.post(`${config.apiUrl}/api/auth/sign-in/email`, {
    data: { email, password: "Test1234@@" },
    headers: { Origin: config.webOrigin },
  });

  expect(signIn.status()).toBe(401);
});

test("does not offer a sign-up link on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("link", { name: /create an account/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
});
