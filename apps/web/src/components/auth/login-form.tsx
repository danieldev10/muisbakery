"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

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
        <label className="text-sm font-medium text-stone-700" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          autoFocus
          className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
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
          className="text-sm font-medium text-stone-700"
          htmlFor="password"
        >
          Password
        </label>
        <input
          autoComplete="current-password"
          className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-stone-400"
        disabled={isSubmitting}
        type="submit"
      >
        <LogIn aria-hidden="true" className="size-4" />
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
