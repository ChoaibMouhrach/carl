import { describe, expect, test } from "bun:test";
import {
  linkedinQuery,
  pickLinkedinUrl,
  pickWebsite,
  websiteQuery,
} from "@server/lib/web-presence";

const jane = { name: "Jane Doe", community: "Jane Club" };

const result = (url: string, title = "Jane Doe - Coach | LinkedIn") => ({
  url,
  title,
  content: "",
});

describe("pickLinkedinUrl", () => {
  const cases: [string, string[], string | null][] = [
    [
      "takes the first profile and drops the query string and trailing slash",
      [
        "https://www.linkedin.com/company/acme",
        "https://uk.linkedin.com/in/jane-doe/?trk=abc",
        "https://www.linkedin.com/in/other",
      ],
      "https://www.linkedin.com/in/jane-doe",
    ],
    [
      "ignores pages that are not profiles",
      [
        "https://www.linkedin.com/company/acme",
        "https://www.linkedin.com/posts/jane",
        "https://notlinkedin.com/in/jane",
      ],
      null,
    ],
    ["ignores values that are not URLs", ["not a url", ""], null],
    ["finds nothing in no results", [], null],
  ];

  test.each(cases)("%s", (_name, urls, expected) => {
    expect(
      pickLinkedinUrl(
        urls.map((url) => result(url)),
        jane,
      ),
    ).toBe(expected);
  });
});

describe("who a result is about", () => {
  test("a profile needs the lead's first and last name in its title or address, ignoring accents and case", () => {
    const accented = { name: "José Álvarez", community: null };

    expect(
      pickLinkedinUrl(
        [result("https://www.linkedin.com/in/someone", "JOSE ALVAREZ | Coach")],
        accented,
      ),
    ).toBe("https://www.linkedin.com/in/someone");
    expect(
      pickLinkedinUrl(
        [result("https://www.linkedin.com/in/jane-doe-1a2b", "Profile")],
        jane,
      ),
    ).toBe("https://www.linkedin.com/in/jane-doe-1a2b");
    expect(
      pickLinkedinUrl(
        [result("https://www.linkedin.com/in/jane-smith", "Jane Smith")],
        jane,
      ),
    ).toBeNull();
  });

  test("a site is kept when it names the lead or the whole community, and skipped when it names neither", () => {
    const page = (title: string, content: string) => ({
      url: "https://example.com/",
      title,
      content,
    });

    expect(pickWebsite([page("Jane Doe Coaching", "")], jane)).toBe(
      "https://example.com/",
    );
    expect(
      pickWebsite([page("Welcome", "Join the jane club today")], jane),
    ).toBe("https://example.com/");
    expect(
      pickWebsite([page("Welcome", "A jane of all trades")], jane),
    ).toBeNull();
    expect(
      pickWebsite([page("Welcome", "Hello")], { ...jane, community: null }),
    ).toBeNull();
  });
});

describe("pickWebsite", () => {
  const cases: [string, string[], string | null][] = [
    [
      "skips social sites and Skool and takes the first real site",
      [
        "https://www.linkedin.com/in/jane",
        "https://m.facebook.com/jane",
        "https://x.com/jane",
        "https://www.skool.com/jane-club",
        "https://janecoaching.com/about",
        "https://other.com",
      ],
      "https://janecoaching.com/about",
    ],
    [
      "does not mistake a lookalike domain for a social site",
      ["https://notfacebook.com/page"],
      "https://notfacebook.com/page",
    ],
    ["skips anything that is not http", ["ftp://files.example.com"], null],
    [
      "finds nothing when every result is a social site",
      ["https://youtube.com/@jane", "https://www.instagram.com/jane"],
      null,
    ],
  ];

  test.each(cases)("%s", (_name, urls, expected) => {
    expect(
      pickWebsite(
        urls.map((url) => result(url)),
        jane,
      ),
    ).toBe(expected);
  });
});

describe("queries", () => {
  test("name the lead and their community, and leave the community out when there is none", () => {
    expect(linkedinQuery({ name: "Jane Doe", community: "Jane Club" })).toBe(
      "Jane Doe Jane Club LinkedIn",
    );
    expect(websiteQuery({ name: "Jane Doe", community: "Jane Club" })).toBe(
      "Jane Doe Jane Club official website",
    );
    expect(linkedinQuery({ name: "Jane Doe", community: null })).toBe(
      "Jane Doe LinkedIn",
    );
  });
});
