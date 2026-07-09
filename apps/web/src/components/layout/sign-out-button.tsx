"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.push("/login");
    router.refresh();
  }

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[color:var(--border-strong)] bg-white px-3 text-sm font-medium text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
      onClick={handleSignOut}
      type="button"
    >
      <LogOut aria-hidden="true" className="size-4" />
      Sign out
    </button>
  );
}
