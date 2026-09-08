"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="whitespace-nowrap rounded-pill border-2 border-text bg-surface px-2.5 py-1 text-xs font-bold text-text transition hover:bg-background active:scale-95"
    >
      Log out
    </button>
  );
}
