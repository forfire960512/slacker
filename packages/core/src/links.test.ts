import { describe, expect, it } from "vitest";
import { extractLinks, splitTextByLinks } from "./links.js";

describe("extractLinks", () => {
  it("returns an empty array when there are no links", () => {
    expect(extractLinks("hello world")).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(extractLinks("")).toEqual([]);
  });

  it("finds a single http link", () => {
    expect(extractLinks("check http://example.com out")).toEqual(["http://example.com"]);
  });

  it("finds a single https link", () => {
    expect(extractLinks("check https://example.com out")).toEqual(["https://example.com"]);
  });

  it("finds multiple links in one message", () => {
    expect(extractLinks("a http://x.com b https://y.com c")).toEqual(["http://x.com", "https://y.com"]);
  });

  it("includes trailing punctuation as part of the URL (documented current behavior)", () => {
    // The regex only excludes whitespace and <>"' — a trailing "." right
    // after a URL with no space is swept in. Not "correct" in a strict
    // sense, but this test pins the current, deliberate behavior so a
    // future regex tweak is a conscious choice, not an accidental fix.
    expect(extractLinks("see https://x.com.")).toEqual(["https://x.com."]);
  });

  it("does not treat plain text mentioning http as a link", () => {
    expect(extractLinks("http is a protocol, not a link by itself")).toEqual([]);
  });
});

describe("splitTextByLinks", () => {
  it("returns the whole string as one segment when there are no links", () => {
    expect(splitTextByLinks("hello world")).toEqual(["hello world"]);
  });

  it("returns a single empty segment for an empty string", () => {
    expect(splitTextByLinks("")).toEqual([""]);
  });

  it("alternates plain-text/link segments for a link mid-sentence", () => {
    expect(splitTextByLinks("check http://example.com out")).toEqual(["check ", "http://example.com", " out"]);
  });

  it("alternates correctly across multiple links, keeping link segments at odd indices", () => {
    const segments = splitTextByLinks("a http://x.com b https://y.com c");
    expect(segments).toEqual(["a ", "http://x.com", " b ", "https://y.com", " c"]);
    expect(segments[1]).toBe("http://x.com");
    expect(segments[3]).toBe("https://y.com");
  });

  it("produces the same links extractLinks would, at the odd indices", () => {
    const text = "see https://a.com and http://b.com too";
    const links = extractLinks(text);
    const segments = splitTextByLinks(text);
    const linksFromSegments = segments.filter((_, i) => i % 2 === 1);
    expect(linksFromSegments).toEqual(links);
  });
});
