import { describe, expect, it } from "vitest";
import { extractReadRequests, extractUrls, stripReadRequests } from "./web-reader";

describe("extractUrls", () => {
  it("finds public URLs and trims trailing punctuation", () => {
    expect(extractUrls("Mira https://nextboost.pe/servicios, y (https://example.com/a).")).toEqual([
      "https://nextboost.pe/servicios",
      "https://example.com/a",
    ]);
  });

  it("drops duplicates and private hosts", () => {
    expect(extractUrls("http://localhost:3000 http://192.168.1.4 https://a.com https://a.com")).toEqual([
      "https://a.com",
    ]);
  });
});

describe("read requests", () => {
  it("extracts and strips [[LEER: url]] lines", () => {
    const text = "Necesito revisar esto:\n[[LEER: https://a.com/precios]]\n[[LEER: https://b.com]]";
    expect(extractReadRequests(text)).toEqual(["https://a.com/precios", "https://b.com"]);
    expect(stripReadRequests(text)).toBe("Necesito revisar esto:");
  });
});
