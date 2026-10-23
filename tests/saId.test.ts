import { describe, expect, it } from "vitest";
import { validateSaIdNumber } from "../src/saId";

describe("South African ID numbers", () => {
  it("accepts the valid sample ID numbers", () => {
    for (const idNumber of ["8001015009087", "9202204720083", "0506155800085"]) {
      const result = validateSaIdNumber(idNumber);
      expect(result).toEqual({ ok: true, idNumber });
    }
  });

  it("accepts a real leap day", () => {
    expect(validateSaIdNumber("0402295000085")).toEqual({
      ok: true,
      idNumber: "0402295000085",
    });
  });

  it("accepts an ID written with spaces", () => {
    expect(validateSaIdNumber("800101 5009 087")).toEqual({
      ok: true,
      idNumber: "8001015009087",
    });
  });

  it("rejects the sample ID with a bad citizenship digit and a bad check digit", () => {
    expect(validateSaIdNumber("7712319999999")).toEqual({
      ok: false,
      reasons: ["ID number citizenship digit must be 0 or 1", "ID number check digit is wrong"],
    });
  });

  it("rejects 30 February even when the check digit is correct", () => {
    expect(validateSaIdNumber("9902305800086")).toEqual({
      ok: false,
      reasons: ["ID number has an impossible date of birth"],
    });
  });

  it("rejects 29 February in a year that is not a leap year", () => {
    expect(validateSaIdNumber("0502295000082").ok).toBe(false);
  });

  it("rejects citizenship digit 2 even when the check digit is correct", () => {
    expect(validateSaIdNumber("8001015009285")).toEqual({
      ok: false,
      reasons: ["ID number citizenship digit must be 0 or 1"],
    });
  });

  it("rejects a wrong check digit on an otherwise valid ID", () => {
    expect(validateSaIdNumber("8001015009080")).toEqual({
      ok: false,
      reasons: ["ID number check digit is wrong"],
    });
  });

  it("rejects values that are not 13 digits, and does not add other reasons", () => {
    expect(validateSaIdNumber("800101500908")).toEqual({
      ok: false,
      reasons: ["ID number must be 13 digits"],
    });
    expect(validateSaIdNumber("ABC")).toEqual({
      ok: false,
      reasons: ["ID number must be 13 digits"],
    });
  });
});
