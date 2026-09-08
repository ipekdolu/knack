"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MascotPlaceholder } from "@/components/ui/mascot-placeholder";

function LoginForm() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Errors reach this page two ways: thrown locally when starting the OAuth
  // redirect, or handed back by /auth/callback as a query param (which covers
  // both Google's own errors and a failed code exchange).
  const shownError = error ?? searchParams.get("error");

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // On success the browser navigates to Google, so loading stays true.
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <MascotPlaceholder alt="Knack potato mascot" size={80} />
      <h1 className="font-logo text-3xl font-extrabold">Knack</h1>

      {shownError && (
        <p className="max-w-sm rounded-btn border-2 border-error bg-error/10 px-3 py-2 text-center text-sm font-medium text-error">
          {shownError}
        </p>
      )}

      <Button onClick={handleLogin} disabled={loading}>
        {loading ? "Redirecting..." : "Sign in with Google"}
      </Button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
