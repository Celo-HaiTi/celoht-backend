import { describe, expect, it } from "vitest";
import { messages, translateStatus } from "./messages";

describe("portal localization", () => {
  it("includes every interface key in all four supported languages", () => {
    const keys = Object.keys(messages.en);
    expect(Object.keys(messages.ht)).toEqual(keys);
    expect(Object.keys(messages.fr)).toEqual(keys);
    expect(Object.keys(messages.es)).toEqual(keys);
  });

  it("translates known application statuses and preserves unknown data", () => {
    expect(translateStatus("ht", "under_review")).toBe("An revizyon");
    expect(translateStatus("fr", "published")).toBe("Publié");
    expect(translateStatus("es", "finalized")).toBe("Finalizado");
    expect(translateStatus("en", "custom_status")).toBe("custom status");
  });
});