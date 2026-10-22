import { expect, test } from "bun:test";
import { emailFinderWebhookUrl } from "@server/lib/webhook-url";

test("a public API address gives the webhook address under it, whatever path or port it has", () => {
  expect(emailFinderWebhookUrl("https://api.example.com")).toBe(
    "https://api.example.com/api/webhooks/email-finder",
  );
  expect(emailFinderWebhookUrl("https://example.com/some/path/")).toBe(
    "https://example.com/api/webhooks/email-finder",
  );
  expect(emailFinderWebhookUrl("http://example.com:8080")).toBe(
    "http://example.com:8080/api/webhooks/email-finder",
  );
});

test("an address only this machine or network can reach, or one that is not a web address, gives no webhook", () => {
  const unreachable = [
    "http://localhost:3002",
    "http://app.localhost",
    "http://127.0.0.1:3002",
    "http://0.0.0.0",
    "http://[::1]:3002",
    "http://10.0.0.5",
    "http://192.168.1.20",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://169.254.1.1",
    "http://carl.local",
    "http://carl.internal",
    "ftp://example.com",
    "not a url",
    "",
  ];

  for (const address of unreachable) {
    expect(emailFinderWebhookUrl(address)).toBeNull();
  }
});

test("addresses that only look private are still public", () => {
  expect(emailFinderWebhookUrl("http://172.32.0.1")).toBe(
    "http://172.32.0.1/api/webhooks/email-finder",
  );
  expect(emailFinderWebhookUrl("https://localhost.example.com")).toBe(
    "https://localhost.example.com/api/webhooks/email-finder",
  );
});
