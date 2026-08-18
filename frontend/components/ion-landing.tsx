"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { IonVideoBackground } from "@/components/ion-video-background";
import { ApiError, api } from "@/lib/api-client";
import { safeNextPath } from "@/lib/auth-paths";

export function IonLanding({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const router = useRouter();
  const destination = safeNextPath(nextPath);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void api.auth.me().then(() => {
      if (active) router.replace(destination);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [destination, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      await api.auth.login(email.trim().toLocaleLowerCase("en-US"), password);
      await api.auth.me();
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else if (cause instanceof ApiError && (cause.status === 400 || cause.status === 401)) {
        setError("The email or password is incorrect.");
      } else if (cause instanceof ApiError && cause.status === 403) {
        setError("Your secure session expired. Please try again.");
      } else {
        setError("Sign in is temporarily unavailable. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="ion-landing relative h-[100svh] min-h-[100svh] w-screen overflow-hidden bg-[#04070f] text-white">
      <IonVideoBackground />
      <div className="ion-scrim pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center px-5 py-6 sm:px-8 sm:py-7" aria-label="Vulcan">
        <span className="ion-display text-[27px] tracking-tight">Vulcan</span>
      </header>

      <div className="ion-login-position pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4 sm:px-8">
        <form
          id="sign-in"
          className="ion-login-panel pointer-events-auto w-full max-w-[21rem] rounded-[22px] px-6 py-6 sm:px-7 sm:py-7"
          onSubmit={handleSubmit}
          aria-busy={submitting}
        >
          <div className="mb-5 text-center">
            <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.34em] text-white/40">Secure workspace</p>
            <h2 className="ion-display text-[28px] leading-none">Sign in to Vulcan</h2>
          </div>
          <div className="space-y-4">
            <label className="block" htmlFor="email">
              <span className="mb-2 block text-[11px] font-medium text-white/65">Email</span>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="ion-login-input h-11 w-full rounded-xl px-3.5 text-[13px] text-white outline-none transition placeholder:text-white/25 focus-visible:ring-2 focus-visible:ring-white/45"
              />
            </label>
            <label className="block" htmlFor="password">
              <span className="mb-2 block text-[11px] font-medium text-white/65">Password</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="ion-login-input h-11 w-full rounded-xl px-3.5 text-[13px] text-white outline-none transition placeholder:text-white/25 focus-visible:ring-2 focus-visible:ring-white/45"
              />
            </label>
          </div>
          <p className="mt-3 min-h-4 text-center text-[11px] leading-4 text-red-200" role="alert" aria-live="polite">{error}</p>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full border-0 bg-white px-5 text-[12px] font-semibold text-[#04070f] transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-65"
          >
            {submitting ? <><span className="ion-button-spinner" aria-hidden="true" />Signing in…</> : "Sign in"}
          </button>
        </form>
      </div>

      <section className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-92px)] max-w-7xl flex-col justify-end px-5 pb-8 sm:px-8 sm:pb-12" aria-labelledby="ion-headline">
        <div className="ion-hero-copy">
          <p className="ion-enter ion-enter-eyebrow mb-4 text-[10px] font-medium uppercase tracking-[0.38em] text-white/45">Operational intelligence</p>
          <h1 id="ion-headline" className="ion-display ion-enter ion-enter-headline max-w-[12ch] text-[2.75rem] leading-[0.94] tracking-[-0.02em] sm:text-6xl md:text-7xl">
            See every operation.<br /><em className="not-italic text-white/[0.48]">Act before it slips.</em>
          </h1>
        </div>
      </section>
    </main>
  );
}
