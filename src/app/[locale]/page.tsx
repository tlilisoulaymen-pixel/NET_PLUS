import { redirect } from "next/navigation";

export default function Home() {
  // Middleware handles auth: authenticated → /desk, unauthenticated → /login
  redirect("/login");
}

