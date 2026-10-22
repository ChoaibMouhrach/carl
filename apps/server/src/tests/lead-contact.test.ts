import { describe, expect, test } from "bun:test";
import {
  buildLookup,
  domainOf,
  NO_USABLE_NAME,
  NO_USABLE_WEBSITE,
  splitName,
} from "@server/lib/lead-contact";

describe("splitName", () => {
  const cases: [
    string,
    string,
    { firstName: string; lastName: string } | null,
  ][] = [
    ["two words", "Jane Doe", { firstName: "Jane", lastName: "Doe" }],
    [
      "the first and the last of several words",
      "Mary Jane Watson",
      { firstName: "Mary", lastName: "Watson" },
    ],
    [
      "emoji, brackets and punctuation around it",
      "🚀 Jane Doe (Coach) ✨",
      { firstName: "Jane", lastName: "Doe" },
    ],
    [
      "accents and non-Latin letters",
      "José Álvarez",
      { firstName: "José", lastName: "Álvarez" },
    ],
    ["a single word", "Madonna", null],
    ["a word and an initial", "Jane D", null],
    ["only emoji", "🚀 ✨", null],
    ["nothing", "   ", null],
  ];

  test.each(cases)("%s", (_name, input, expected) => {
    expect(splitName(input)).toEqual(expected);
  });
});

describe("domainOf", () => {
  const cases: [string, string, string | null][] = [
    [
      "drops www, path and query",
      "https://www.Example.com/about?x=1",
      "example.com",
    ],
    ["accepts a bare domain", "example.com", "example.com"],
    ["keeps a subdomain", "https://coach.example.org", "coach.example.org"],
    ["rejects a link-in-bio page", "https://linktr.ee/jane", null],
    ["rejects a subdomain of a site builder", "https://jane.carrd.co", null],
    ["rejects a social site", "https://www.instagram.com/jane", null],
    [
      "does not mistake a lookalike for a shared domain",
      "https://notlinktr.ee",
      "notlinktr.ee",
    ],
    ["rejects an IP address", "http://192.168.0.1/page", null],
    ["rejects a host with no dot", "http://localhost", null],
    ["rejects text that is not a URL", "not a url", null],
  ];

  test.each(cases)("%s", (_name, input, expected) => {
    expect(domainOf(input)).toBe(expected);
  });
});

describe("buildLookup", () => {
  const lead = {
    key: "k",
    name: "Jane Doe",
    website: null as string | null,
    linkedinUrl: null as string | null,
  };

  test("a LinkedIn URL is enough, even with an unusable name or no website", () => {
    expect(
      buildLookup({
        ...lead,
        name: "Madonna",
        linkedinUrl: "https://www.linkedin.com/in/m",
      }),
    ).toEqual({
      lookup: {
        key: "k",
        firstName: null,
        lastName: null,
        domain: null,
        linkedinUrl: "https://www.linkedin.com/in/m",
      },
    });
  });

  test("without LinkedIn it needs a usable name and then a usable website, in that order", () => {
    expect(buildLookup({ ...lead, name: "Madonna" })).toEqual({
      reason: NO_USABLE_NAME,
    });
    expect(buildLookup({ ...lead, website: "https://linktr.ee/j" })).toEqual({
      reason: NO_USABLE_WEBSITE,
    });
    expect(buildLookup({ ...lead })).toEqual({ reason: NO_USABLE_WEBSITE });
    expect(buildLookup({ ...lead, website: "https://example.com" })).toEqual({
      lookup: {
        key: "k",
        firstName: "Jane",
        lastName: "Doe",
        domain: "example.com",
        linkedinUrl: null,
      },
    });
  });
});
