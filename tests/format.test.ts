import { describe, expect, it } from "vitest";
import { fmtAge, fmtCompact, fmtDateTime, fmtMusd, fmtNum, fmtPct, fmtUsdCompact, shortAddr } from "@/lib/format";

describe("display formatting", () => {
  it("renders missing or non-finite values as a word, never 0", () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fmtPct(v)).toBe("Unavailable");
      expect(fmtNum(v)).toBe("Unavailable");
      expect(fmtMusd(v)).toBe("Unavailable");
      expect(fmtUsdCompact(v)).toBe("Unavailable");
      expect(fmtCompact(v)).toBe("Unavailable");
    }
  });

  it("formats percentages with optional sign", () => {
    expect(fmtPct(0.0525)).toBe("5.25%");
    expect(fmtPct(0.0525, 1)).toBe("5.3%");
    expect(fmtPct(0.0525, 2, true)).toBe("+5.25%");
    expect(fmtPct(-0.01, 2, true)).toBe("-1.00%");
    expect(fmtPct(0, 2, true)).toBe("0.00%");
  });

  it("formats MUSD amounts with grouping and a true minus sign", () => {
    expect(fmtMusd(10_000)).toBe("10,000.00");
    expect(fmtMusd(-1234.5)).toBe("−1,234.50");
    expect(fmtMusd(12.3, 2, true)).toBe("+12.30");
    expect(fmtMusd(0, 2, true)).toBe("0.00");
  });

  it("formats compact numbers and USD", () => {
    expect(fmtNum(1234.567, 1)).toBe("1,234.6");
    expect(fmtCompact(120_000)).toBe("120K");
    expect(fmtUsdCompact(120_000)).toBe("$120K");
    expect(fmtUsdCompact(2_345_678)).toBe("$2.35M");
    expect(fmtUsdCompact(-2_345_678)).toBe("-$2.35M");
  });

  it("describes age relative to a fixed clock", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(fmtAge("2026-11-14T11:59:30Z", now)).toBe("30s ago");
    expect(fmtAge("2026-11-14T11:30:00Z", now)).toBe("30 min ago");
    expect(fmtAge("2026-11-14T06:00:00Z", now)).toBe("6 h ago");
    expect(fmtAge("2026-11-10T12:00:00Z", now)).toBe("4 days ago");
    expect(fmtAge("2026-11-14T12:05:00Z", now)).toBe("0s ago");
    expect(fmtAge(null, now)).toBe("unknown time");
    expect(fmtAge("not a date", now)).toBe("unknown time");
  });

  it("formats timestamps in UTC and shortens addresses", () => {
    expect(fmtDateTime("2026-11-14T09:07:42.123Z")).toBe("2026-11-14 09:07 UTC");
    expect(fmtDateTime("garbage")).toBe("Unknown");
    expect(fmtDateTime(undefined)).toBe("Unknown");
    expect(shortAddr("0x72A5405fDFe3DF30b0DFa40E76C08f5C011a7391")).toBe("0x72A5…7391");
    expect(shortAddr(null)).toBe("");
  });
});
