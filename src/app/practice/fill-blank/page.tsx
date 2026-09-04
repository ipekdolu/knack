import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExerciseSession from "../exercise-session";

export default async function FillBlankPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <ExerciseSession type="fill_blank" title="Fill in the Blank" />;
}
