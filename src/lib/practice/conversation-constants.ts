// Plain constants, split out of conversation.ts -- a "use server" module can
// only export async functions, so these (needed client-side too, e.g. the
// speaking-turns setting picker) live here instead.
export const DEFAULT_TURNS = 6;
export const TURN_OPTIONS = [4, 6, 8, 10] as const;
