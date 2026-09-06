import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function failure(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(message)}`,
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Google can bounce back with an error and no code at all (consent denied,
  // redirect_uri_mismatch, app not verified...). Surface its own description
  // rather than a generic failure -- it names the actual problem.
  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return failure(origin, oauthError);
  }

  if (!code) {
    return failure(origin, "Google did not return an authorization code.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return failure(origin, `Could not complete sign-in: ${error.message}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
