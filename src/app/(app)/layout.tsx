import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/app-nav";
import LogoutButton from "../logout-button";

// Every signed-in space renders inside this shell. The auth check lives here
// rather than in each page: middleware alone isn't enough, since a page with
// no dynamic server work can be statically pre-rendered and skip it.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header>
        <div className="mx-auto flex w-full max-w-2xl flex-nowrap items-center gap-x-2 p-4">
          <Link
            href="/home"
            className="whitespace-nowrap font-logo text-lg font-extrabold"
          >
            Knack
          </Link>
          <div className="hidden md:block">
            <AppNav />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
            <Link
              href="/settings"
              className="whitespace-nowrap font-bold text-primary-ink/80 hover:text-primary-ink"
            >
              Settings
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Bottom padding keeps the mobile tab bar from covering page content. */}
      <main className="mx-auto w-full max-w-2xl p-4 pb-24 md:pb-8">{children}</main>

      <div className="md:hidden">
        <AppNav />
      </div>
    </div>
  );
}
