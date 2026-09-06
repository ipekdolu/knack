import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SpeakingPromptSession from "./speaking-prompt-session";

export default async function SpeakingPromptPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <SpeakingPromptSession />;
}
