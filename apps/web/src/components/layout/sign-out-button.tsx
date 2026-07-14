"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/spinner";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[color:var(--border-strong)] bg-white px-3 text-sm font-medium text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isSigningOut}
      onClick={handleSignOut}
      type="button"
    >
      {isSigningOut ? (
        <Spinner />
      ) : (
        <LogOut aria-hidden="true" className="size-4" />
      )}
      {isSigningOut ? "Signing out" : "Sign out"}
    </button>
  );
}
