import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddWordForm from "./add-word-form";

export default async function AddWordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AddWordForm />;
}
