"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Layers3,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import LeadHunterLogo from "@/components/branding/LeadHunterLogo";

type AuthMode = "signin" | "signup";

function safeNextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

function authErrorMessage(message: string | undefined, mode: AuthMode) {
  const normalized = (message ?? "").toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (
    !normalized ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("not configured")
  ) {
    return mode === "signin"
      ? "LeadHunter could not connect to sign you in. Please try again."
      : "LeadHunter could not create your account right now. Please try again.";
  }

  if (normalized.includes("password must be at least")) {
    return "Password must be at least 8 characters.";
  }

  return mode === "signin"
    ? "Unable to sign in. Check your details and try again."
    : "Unable to create your account. Please try again.";
}

export default function LoginForm({ freeMonthlyLeadLimit }: { freeMonthlyLeadLimit: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<AuthMode>(requestedMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const confirmed = searchParams.get("confirmed") === "true";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setCheckEmail(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(mode === "signin" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await response.json()) as {
        error?: string;
        requiresEmailConfirmation?: boolean;
      };

      if (!response.ok) {
        throw new Error(authErrorMessage(payload.error, mode));
      }

      if (payload.requiresEmailConfirmation) {
        setCheckEmail(true);
        return;
      }

      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (submitError) {
      setError(authErrorMessage(submitError instanceof Error ? submitError.message : undefined, mode));
    } finally {
      setLoading(false);
    }
  }

  const heading = mode === "signin" ? "Welcome back" : "Start building better lead lists";
  const supportingCopy =
    mode === "signin"
      ? "Sign in to continue building and organizing your lead lists."
      : `Create your free LeadHunter workspace with up to ${freeMonthlyLeadLimit.toLocaleString()} leads per month.`;

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[var(--page-background)] text-[var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(20,99,255,0.12),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(22,163,74,0.06),transparent_28%)]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="LeadHunter home"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15"
          >
            <LeadHunterLogo size="md" />
          </Link>
          <Link href="/" className="btn-ghost min-h-10 px-3 py-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">Home</span>
            <span className="hidden sm:inline">Back to home</span>
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-16 lg:py-12">
          <section className="hidden max-w-xl lg:block">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-[var(--primary-soft)] px-3.5 py-2 text-xs font-bold text-[var(--primary)]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Private lead workspace
            </span>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.04] tracking-[-0.05em] text-[var(--text-primary)]">
              Turn focused local research into organized outreach lists.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--text-secondary)]">
              Search public business sources, keep useful contact options together, and export the leads that fit your
              campaign.
            </p>

            <div className="mt-9 grid gap-3">
              {[
                [MapPin, "Search almost any niche and city"],
                [Layers3, "Save leads without duplicate rows"],
                [Mail, "Find public contact information when available"],
                [FileSpreadsheet, "Export to Google Sheets, CSV, and Excel"],
              ].map(([Icon, copy]) => {
                const ValueIcon = Icon as typeof MapPin;
                return (
                  <div key={String(copy)} className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-white/80 p-4 shadow-[var(--shadow-small)]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                      <ValueIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-[var(--navy-secondary)]">{String(copy)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="w-full rounded-[24px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-elevated)] sm:p-8">
            {checkEmail ? (
              <div className="py-7 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--success-soft)] text-[var(--success)]">
                  <Mail className="h-6 w-6" aria-hidden="true" />
                </span>
                <h1 className="mt-6 text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">Check your email</h1>
                <p className="mt-3 leading-7 text-[var(--text-secondary)]">
                  We sent a confirmation link to <span className="font-semibold text-[var(--text-primary)]">{email}</span>.
                  Confirm your account, then return here to sign in.
                </p>
                <button type="button" onClick={() => switchMode("signin")} className="btn-primary mt-7 w-full">
                  Return to sign in
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-bold text-[var(--primary)]">{mode === "signin" ? "Welcome back" : "Free workspace"}</p>
                  <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-[var(--text-primary)]">{heading}</h1>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{supportingCopy}</p>
                </div>

                {confirmed ? (
                  <div className="app-alert app-alert-success mt-6" role="status">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p>Email confirmed. You can sign in now.</p>
                  </div>
                ) : null}

                <div className="app-tabs mt-7 grid w-full grid-cols-2" aria-label="Authentication mode">
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    aria-pressed={mode === "signin"}
                    className={`app-tab ${mode === "signin" ? "app-tab-active" : ""}`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    aria-pressed={mode === "signup"}
                    className={`app-tab ${mode === "signup" ? "app-tab-active" : ""}`}
                  >
                    Create account
                  </button>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-5" aria-describedby={error ? "auth-error" : undefined}>
                  <label className="block" htmlFor="auth-email">
                    <span className="app-label">Email</span>
                    <span className="relative mt-2 block">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                        aria-invalid={Boolean(error)}
                        className="app-input h-12 pl-11"
                        placeholder="you@company.com"
                      />
                    </span>
                  </label>

                  <label className="block" htmlFor="auth-password">
                    <span className="app-label">Password</span>
                    <span className="relative mt-2 block">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                      <input
                        id="auth-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        required
                        minLength={mode === "signup" ? 8 : undefined}
                        aria-invalid={Boolean(error)}
                        aria-describedby={mode === "signup" ? "password-requirement" : undefined}
                        className="app-input h-12 px-11"
                        placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </span>
                    {mode === "signup" ? (
                      <span id="password-requirement" className="mt-2 block text-xs text-[var(--text-muted)]">
                        Use at least 8 characters.
                      </span>
                    ) : null}
                  </label>

                  {mode === "signup" ? (
                    <label className="block" htmlFor="auth-confirm-password">
                      <span className="app-label">Confirm password</span>
                      <input
                        id="auth-confirm-password"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        required
                        aria-invalid={Boolean(error)}
                        className="app-input mt-2 h-12"
                        placeholder="Repeat your password"
                      />
                    </label>
                  ) : null}

                  {error ? (
                    <div id="auth-error" role="alert" className="app-alert app-alert-error">
                      <p>{error}</p>
                    </div>
                  ) : null}

                  <button type="submit" disabled={loading} className="btn-primary h-12 w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create free workspace"}
                  </button>
                </form>

                {mode === "signup" ? (
                  <p className="mt-5 text-center text-xs leading-5 text-[var(--text-muted)]">
                    By creating an account, you agree to the{" "}
                    <Link href="/terms" className="font-semibold text-[var(--primary)] hover:underline">Terms of Service</Link>
                    {" "}and acknowledge the{" "}
                    <Link href="/privacy" className="font-semibold text-[var(--primary)] hover:underline">Privacy Policy</Link>.
                  </p>
                ) : (
                  <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
                    New to LeadHunter?{" "}
                    <button type="button" onClick={() => switchMode("signup")} className="font-bold text-[var(--primary)] hover:underline">
                      Create a free account
                    </button>
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-[var(--border-default)] py-5 text-xs text-[var(--text-muted)] sm:flex-row">
          <p>Public business research for organized outreach.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[var(--primary)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--primary)]">Terms</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
