"use client";

import { redirect } from "next/navigation";

/**
 * Quick-create stub.
 * Future: open a modal to choose DocType → navigate to new form.
 * For now, redirect to Desk home so the "New" button never 404s.
 */
export default function NewPage() {
  redirect("/desk");
}
