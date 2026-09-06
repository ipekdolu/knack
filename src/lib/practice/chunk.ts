// Chunks a session's words into groups of [min, max] words, avoiding a
// leftover group smaller than min (a remainder that would dangle below min
// shrinks the prior group instead, e.g. min=2/max=3 splits a remainder of 4
// into 2+2 rather than 3+1). Shared by the written and spoken multi-word
// exercises; reading passages use a larger min/max than sentence practice.
export function chunkWords<T>(
  words: T[],
  { min = 2, max = 3 }: { min?: number; max?: number } = {},
): T[][] {
  const groups: T[][] = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    const size =
      remaining <= max
        ? remaining
        : remaining - max < min
          ? remaining - min
          : max;
    groups.push(words.slice(i, i + size));
    i += size;
  }
  return groups;
}
