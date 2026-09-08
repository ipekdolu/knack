import Anthropic from "@anthropic-ai/sdk";

// Centralized client construction: an explicit timeout so a hung request
// doesn't leave the UI stuck in "generating..." forever, and a couple of
// automatic retries (on top of the SDK's own backoff) for transient
// failures -- rate limits, momentary 5xx/overload -- before the caller ever
// sees an error.
export function createAnthropicClient(): Anthropic {
  return new Anthropic({
    timeout: 30_000,
    maxRetries: 2,
  });
}

// Thin wrapper around `messages.create` so every call site gets the same
// friendly-error translation for free with a one-line change, instead of
// each generation/grading function needing its own try/catch. Also logs the
// real error server-side (stack, status) before it's replaced with a short
// user-facing message -- the only "error rate" visibility this app has
// short of a full analytics setup, but it's what shows up in server/Vercel
// logs when something's actually broken.
export async function createMessage(
  anthropic: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  try {
    return await anthropic.messages.create(params);
  } catch (err) {
    console.error(`[claude] ${params.model} request failed:`, err);
    throw toFriendlyClaudeError(err);
  }
}

// Normalizes whatever the SDK (or a local "no tool_use block" failure)
// throws into a short, user-facing message. Every generation/grading call
// site should catch its own errors and rethrow through this, so the
// exercise UI never has to render a raw API/JSON error string.
export function toFriendlyClaudeError(err: unknown): Error {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429) {
      return new Error(
        "Claude is a bit busy right now -- please try again in a moment.",
      );
    }
    if (err.status && err.status >= 500) {
      return new Error("Claude had trouble responding -- please try again.");
    }
    return new Error(
      "Something went wrong generating that -- please try again.",
    );
  }
  if (err instanceof Error) {
    if (err.name === "APIConnectionTimeoutError") {
      return new Error("That took too long to generate -- please try again.");
    }
    return err;
  }
  return new Error("Something went wrong -- please try again.");
}
