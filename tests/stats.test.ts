import { describe, expect, it } from "vitest";
import { mean, median, MIN_SUMMARY_SAMPLES, stdev } from "@/lib/engine/stats";

describe("summary statistics", () => {
  it("mean is exact decimal arithmetic and null when empty", () => {
    expect(mean([])).toBeNull();
    expect(mean([0.1, 0.2])!.toString()).toBe("0.15");
    expect(mean(["0.1", "0.2", "0.3"])!.toString()).toBe("0.2");
  });

  it("median skips null/undefined and needs MIN_SUMMARY_SAMPLES real values", () => {
    expect(MIN_SUMMARY_SAMPLES).toBe(3);
    expect(median([1, undefined, 2, null])).toBeNull();
    expect(median([3, undefined, 1, null, 2])!.toString()).toBe("2");
    expect(median([], 0)).toBeNull();
  });

  it("median does not reorder the caller's array", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("stdev is zero for constant series", () => {
    expect(stdev([5, 5, 5])!.toString()).toBe("0");
    expect(stdev([])).toBeNull();
  });
});
