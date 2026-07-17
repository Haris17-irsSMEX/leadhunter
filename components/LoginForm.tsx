"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, Zap } from "lucide-react";

type AuthMode = "signin" | "signup";

function safeNextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
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
        throw new Error(payload.error ?? "Authentication failed.");
      }

      if (payload.requiresEmailConfirmation) {
        setCheckEmail(true);
        return;
      }

      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080a12] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(124,92,252,0.16),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(30,198,156,0.08),transparent_28%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C5CFC,#5B3FE0)]">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">LeadHunter</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1fr_480px]">
          <section className="hidden max-w-xl lg:block">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-300">Early access</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.045em]">
              Fresh prospects, ready for your next outreach campaign.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
              Search Google Maps and startup communities, keep promising leads organized, and move them into the tools
              your team already uses.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-slate-300">
              {["25 leads per month on the free plan", "CSV export included", "No credit card required during early access"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[#121625]/95 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:p-8">
            {checkEmail ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                  <Mail className="h-6 w-6" />
                </span>
                <h2 className="mt-6 text-2xl font-semibold">Check your email</h2>
                <p className="mt-3 leading-6 text-slate-400">
                  We sent a confirmation link to <span className="text-white">{email}</span>. Confirm your account, then
                  return here to sign in.
                </p>
                <button type="button" onClick={() => switchMode("signin")} className="btn-primary mt-7 justify-center">
                  Return to sign in
                </button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-violet-300">{mode === "signin" ? "Welcome back" : "Start early access"}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                    {mode === "signin" ? "Sign in to LeadHunter" : "Create your account"}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {mode === "signin"
                      ? "Continue to your private lead workspace."
                      : "Start with 25 leads per month. No credit card required."}
                  </p>
                </div>

                {confirmed ? (
                  <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                    Email confirmed. You can sign in now.
                  </div>
                ) : null}

                <div className="mt-7 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className={`h-10 rounded-lg text-sm font-medium transition ${
                      mode === "signin" ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className={`h-10 rounded-lg text-sm font-medium transition ${
                      mode === "signup" ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Create account
                  </button>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-5">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">Email</span>
                    <span className="relative mt-2 block">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                        className="app-input h-12 w-full pl-11"
                        placeholder="you@company.com"
                      />
                    </span>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">Password</span>
                    <span className="relative mt-2 block">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        required
                        minLength={mode === "signup" ? 8 : undefined}
                        className="app-input h-12 w-full px-11"
                        placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </label>

                  {mode === "signup" ? (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-200">Confirm password</span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                        required
                        className="app-input mt-2 h-12 w-full"
                        placeholder="Repeat your password"
                      />
                    </label>
                  ) : null}

                  {error ? (
                    <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                      {error}
                    </div>
                  ) : null}

                  <button type="submit" disabled={loading} className="btn-primary h-12 w-full justify-center disabled:opacity-60">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
