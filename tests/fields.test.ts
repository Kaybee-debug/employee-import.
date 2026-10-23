import { describe, expect, it } from "vitest";
import { parseDisability, parseMonthlyCtc } from "../src/fields";

describe("disability values", () => {
  it("maps the common inputs onto Yes or No", () => {
    const yes = ["Y", "yes", "true", "TRUE", "1", "Disabled", "t"];
    const no = ["N", "no", "false", "0", "none", "not disabled", "f"];

    for (const value of yes) {
      expect(parseDisability(value)).toEqual({ kind: "value", value: "Yes" });
    }
    for (const value of no) {
      expect(parseDisability(value)).toEqual({ kind: "value", value: "No" });
    }
    expect(parseDisability(true)).toEqual({ kind: "value", value: "Yes" });
    expect(parseDisability(false)).toEqual({ kind: "value", value: "No" });
    expect(parseDisability(1)).toEqual({ kind: "value", value: "Yes" });
    expect(parseDisability(0)).toEqual({ kind: "value", value: "No" });
  });

  it("leaves a blank cell blank and rejects values it does not know", () => {
    expect(parseDisability("")).toEqual({ kind: "blank" });
    expect(parseDisability(null)).toEqual({ kind: "blank" });
    expect(parseDisability("   ")).toEqual({ kind: "blank" });
    expect(parseDisability("maybe")).toEqual({ kind: "invalid", raw: "maybe" });
  });
});

describe("monthly CTC", () => {
  it("reads numbers, spaces, commas and a rand sign", () => {
    expect(parseMonthlyCtc("32 500")).toEqual({ kind: "amount", cents: 3_250_000, rands: 32500 });
    expect(parseMonthlyCtc("R32,500.50")).toEqual({ kind: "amount", cents: 3_250_050, rands: 32500.5 });
    expect(parseMonthlyCtc(19750)).toEqual({ kind: "amount", cents: 1_975_000, rands: 19750 });
  });

  it("treats a blank as blank and rejects text that is not an amount", () => {
    expect(parseMonthlyCtc("")).toEqual({ kind: "blank" });
    expect(parseMonthlyCtc(null)).toEqual({ kind: "blank" });
    expect(parseMonthlyCtc("abc").kind).toBe("invalid");
    expect(parseMonthlyCtc(-10).kind).toBe("invalid");
  });
});
