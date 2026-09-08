import { describe, expect, it } from "vitest";
import { nextMasteryStage, shuffle } from "./shared";

describe("nextMasteryStage", () => {
  it("promotes a new word to learning on its first correct answer", () => {
    expect(nextMasteryStage("new", true, 1)).toBe("learning");
  });

  it("keeps a learning word in learning below a streak of 3", () => {
    expect(nextMasteryStage("learning", true, 1)).toBe("learning");
    expect(nextMasteryStage("learning", true, 2)).toBe("learning");
  });

  it("promotes a learning word to mastered at a streak of 3", () => {
    expect(nextMasteryStage("learning", true, 3)).toBe("mastered");
    expect(nextMasteryStage("learning", true, 4)).toBe("mastered");
  });

  it("keeps a mastered word mastered on further correct answers", () => {
    expect(nextMasteryStage("mastered", true, 10)).toBe("mastered");
  });

  it("demotes mastered to learning on a miss, rather than all the way to new", () => {
    expect(nextMasteryStage("mastered", false, 0)).toBe("learning");
  });

  it("resets new or learning to new on a miss", () => {
    expect(nextMasteryStage("new", false, 0)).toBe("new");
    expect(nextMasteryStage("learning", false, 0)).toBe("new");
  });
});

describe("shuffle", () => {
  it("returns every input element exactly once", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual(input);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });
});
