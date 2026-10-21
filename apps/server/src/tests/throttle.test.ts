import { expect, test } from "bun:test";
import { createThrottle } from "@server/lib/utils";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("the first call runs at once and a burst after it collapses into one trailing run", async () => {
  let runs = 0;
  const throttle = createThrottle(async () => {
    runs += 1;
  }, 60);

  for (let index = 0; index < 20; index += 1) throttle.call();
  await pause(10);
  expect(runs).toBe(1);

  await pause(120);
  expect(runs).toBe(2);
  throttle.stop();
});

test("calls spaced further apart than the interval each run", async () => {
  let runs = 0;
  const throttle = createThrottle(async () => {
    runs += 1;
  }, 30);

  throttle.call();
  await pause(60);
  throttle.call();
  await pause(10);

  expect(runs).toBe(2);
  throttle.stop();
});

test("stopping cancels the pending trailing run", async () => {
  let runs = 0;
  const throttle = createThrottle(async () => {
    runs += 1;
  }, 50);

  throttle.call();
  throttle.call();
  throttle.stop();
  await pause(120);

  expect(runs).toBe(1);
});
