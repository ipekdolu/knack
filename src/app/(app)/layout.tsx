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
    <div className="min-h-screen">
      <header className="border-b border-gray-200">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <Link href="/home" className="font-semibold">
            German Vocab
          </Link>
          <div className="hidden md:block">
            <AppNav />
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/settings" className="text-gray-500 hover:underline">
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
