"use client";

import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Spinner } from "@/components/spinner";

type Step = "request" | "confirm" | "complete";

type ApiResponse = {
  message?: unknown;
};

const fieldClass =
  "h-11 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";
const labelClass =
  "text-xs font-semibold uppercase tracking-[1.3px] text-[var(--text-muted)]";

function responseMessage(data: ApiResponse, fallback: string) {
  return typeof data.message === "string" ? data.message : fallback;
}

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok) {
        setError(responseMessage(data, "Unable to request a recovery code."));
        return;
      }

      setNotice(
        responseMessage(
          data,
          "If the account can be recovered, a code has been sent to its recovery email.",
        ),
      );
      setStep("confirm");
    } catch {
      setError(
        "Password recovery requires an internet connection. Check the connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok) {
        setError(responseMessage(data, "Unable to reset the password."));
        return;
      }

      setNotice(
        responseMessage(data, "Password reset. Sign in with your new password."),
      );
      setStep("complete");
    } catch {
      setError(
        "Password recovery requires an internet connection. Check the connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "complete") {
    return (
      <div className="grid gap-5">
        <p className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-800">
          {notice}
        </p>
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)]"
          href="/login"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Return to sign in
        </Link>
      </div>
    );
  }

  if (step === "request") {
    return (
      <form className="grid gap-5" onSubmit={requestCode}>
        <div className="grid gap-2">
          <label className={labelClass} htmlFor="recovery-account-email">
            Account email
          </label>
          <input
            autoComplete="username"
            autoFocus
            className={fieldClass}
            id="recovery-account-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@muisbakery.local"
            required
            type="email"
            value={email}
          />
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            A code will be sent to the recovery email configured by Admin.
          </p>
        </div>

        {error ? (
          <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? <Spinner /> : <Mail aria-hidden className="size-4" />}
          {isSubmitting ? "Sending code" : "Send recovery code"}
        </button>
        <Link
          className="text-center text-sm font-semibold text-[var(--brand-burgundy)] hover:underline"
          href="/login"
        >
          Return to sign in
        </Link>
      </form>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={confirmReset}>
      <p className="rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
        {notice}
      </p>

      <div className="grid gap-2">
        <label className={labelClass} htmlFor="recovery-code">
          8-digit recovery code
        </label>
        <input
          autoComplete="one-time-code"
          autoFocus
          className={fieldClass}
          id="recovery-code"
          inputMode="numeric"
          maxLength={8}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          pattern="[0-9]{8}"
          required
          value={code}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className={labelClass} htmlFor="recovery-password">
            New password
          </label>
          <input
            autoComplete="new-password"
            className={fieldClass}
            id="recovery-password"
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        <div className="grid gap-2">
          <label className={labelClass} htmlFor="recovery-password-confirmation">
            Confirm password
          </label>
          <input
            autoComplete="new-password"
            className={fieldClass}
            id="recovery-password-confirmation"
            minLength={12}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </div>
      </div>
      <p className="text-xs leading-5 text-[var(--text-muted)]">
        Use at least 12 characters. The code expires after 15 minutes and can
        only be used once.
      </p>

      {error ? (
        <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? <Spinner /> : <KeyRound aria-hidden className="size-4" />}
        {isSubmitting ? "Resetting password" : "Reset password"}
      </button>
      <button
        className="text-sm font-semibold text-[var(--brand-burgundy)] hover:underline"
        onClick={() => {
          setCode("");
          setError("");
          setStep("request");
        }}
        type="button"
      >
        Request another code
      </button>
    </form>
  );
}
