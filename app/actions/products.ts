"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProductType = Database["public"]["Enums"]["product_type"];
const VALID_PRODUCT_TYPES: ProductType[] = ["digital", "physical", "ticket", "cohort_seat"];

export async function createProduct(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceDollars = parseFloat(String(formData.get("price") ?? ""));

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  if (!name || !VALID_PRODUCT_TYPES.includes(type as ProductType) || !Number.isFinite(priceDollars) || priceDollars < 0) {
    redirect(`/o/${orgSlug}/settings/products?error=${encodeURIComponent("A name, type, and valid price are required.")}`);
  }

  const { error } = await supabase.from("products").insert({
    org_id: orgId,
    type: type as ProductType,
    name,
    description: description || null,
    price_cents: Math.round(priceDollars * 100),
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/products?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/products`);
  redirect(`/o/${orgSlug}/settings/products`);
}

export async function toggleProductActive(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const nextActive = formData.get("next_active") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ active: nextActive }).eq("id", productId);

  if (error) {
    redirect(`/o/${orgSlug}/settings/products?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/products`);
  redirect(`/o/${orgSlug}/settings/products`);
}
