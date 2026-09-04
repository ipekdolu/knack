import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-lg">Logged in as {user.email}</p>
      <Link
        href="/words/add"
        className="rounded-md bg-black px-4 py-2 text-white hover:bg-gray-800"
      >
        Add a word
      </Link>
      <LogoutButton />
    </div>
  );
}
