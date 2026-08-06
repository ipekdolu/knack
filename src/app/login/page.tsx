"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">German Vocab Practice</h1>
      <button
        onClick={handleLogin}
        className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
      >
        Sign in with Google
      </button>
    </div>
  );
}
