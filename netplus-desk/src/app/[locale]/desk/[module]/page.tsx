import { redirect, notFound } from "next/navigation";
import { getModule } from "@/config/modules";

export default async function ModuleRedirect({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const mod = getModule(slug);
  
  if (!mod) {
    notFound();
  }
  
  if (mod.doctypes && mod.doctypes.length > 0) {
    const first = mod.doctypes[0];
    redirect(first.href ?? `/desk/${mod.slug}/${encodeURIComponent(first.name)}`);
  }
  
  // If the module has no doctypes (like dashboard), just redirect to desk
  redirect("/desk");
}
