import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReadAloudSession from "./read-aloud-session";

export default async function ReadAloudPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ReadAloudSession />;
}
