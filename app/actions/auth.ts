"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/copy";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent") === "on";

  if (!consent) {
    redirect("/signup?error=" + encodeURIComponent(copy.auth.signup.errors.consentRequired));
  }
  if (!email || !password) {
    redirect("/signup?error=" + encodeURIComponent(copy.auth.signup.errors.missingFields));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  redirect("/");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
