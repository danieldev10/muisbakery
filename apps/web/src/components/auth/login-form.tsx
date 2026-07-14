"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Spinner } from "@/components/spinner";
import { getRoleHome } from "@/lib/roles";

type LoginFormProps = {
  callbackUrl?: string;
};

type LoginResponse = {
  role?: unknown;
};

function isInternalPath(value: string | undefined): value is string {
  return Boolean(value?.startsWith("/") && !value.startsWith("//"));
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setError("Invalid email or password.");
      return;
    }

    const data = (await response.json().catch(() => ({}))) as LoginResponse;
    const target = isInternalPath(callbackUrl)
      ? callbackUrl
      : getRoleHome(data.role);

    router.push(target);
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label
          className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
          htmlFor="email"
        >
          Email
        </label>
        <input
          autoComplete="email"
          autoFocus
          className="h-11 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@muisbakery.com"
          required
          type="email"
          value={email}
        />
      </div>

      <div className="grid gap-2">
        <label
          className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]"
          htmlFor="password"
        >
          Password
        </label>
        <input
          autoComplete="current-password"
          className="h-11 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error ? (
        <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:border-[color:var(--border-muted)] disabled:bg-[#b2b6bd]"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? (
          <Spinner />
        ) : (
          <LogIn aria-hidden="true" className="size-4" />
        )}
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
