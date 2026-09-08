import { describe, expect, it } from "vitest";
import { computeStreak } from "./shared";

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("computeStreak", () => {
  it("is 0 when there's no practice history", () => {
    expect(computeStreak(new Set())).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(2)]);
    expect(computeStreak(days)).toBe(3);
  });

  it("still counts the streak if today hasn't happened yet", () => {
    const days = new Set([daysAgo(1), daysAgo(2), daysAgo(3)]);
    expect(computeStreak(days)).toBe(3);
  });

  it("stops at the first gap", () => {
    const days = new Set([daysAgo(0), daysAgo(1), daysAgo(3)]);
    expect(computeStreak(days)).toBe(2);
  });

  it("is 0 when the most recent practice was more than a day ago", () => {
    const days = new Set([daysAgo(3), daysAgo(4)]);
    expect(computeStreak(days)).toBe(0);
  });
});
