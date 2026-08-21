"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ className = "logout-button" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) { router.push("/login"); router.refresh(); }
    else setPending(false);
  }
  return <button type="button" className={className} onClick={logout} disabled={pending}>{pending ? "Keluar..." : "Logout"}</button>;
}
