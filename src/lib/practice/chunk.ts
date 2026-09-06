// Chunks a session's words into prompts of 2-3 words each, avoiding a lonely
// leftover of 1 (a remainder of 4 splits into 2+2 rather than 3+1). Shared by
// the written and spoken multi-word exercises.
export function chunkWords<T>(words: T[]): T[][] {
  const groups: T[][] = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    const size = remaining <= 3 ? remaining : remaining === 4 ? 2 : 3;
    groups.push(words.slice(i, i + size));
    i += size;
  }
  return groups;
}
