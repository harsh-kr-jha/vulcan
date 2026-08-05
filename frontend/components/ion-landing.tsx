"use client";

import Link from "next/link";
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

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-8 py-7" aria-label="Primary navigation">
        <Link className="ion-display text-[26px] tracking-tight" href="/" aria-label="Ion home">Ion</Link>
        <div className="hidden items-center gap-7 sm:flex">
          <a className="text-[13px] text-white/55 transition-colors hover:text-white focus-visible:text-white" href="#sign-in">Network</a>
          <Link className="text-[13px] text-white/55 transition-colors hover:text-white focus-visible:text-white" href="/dashboard">Platform</Link>
          <a className="text-[13px] text-white/55 transition-colors hover:text-white focus-visible:text-white" href="#sign-in">Careers</a>
        </div>
        <a className="ion-liquid-glass rounded-full px-5 py-2.5 text-[12px] font-medium text-white/90 transition-colors hover:text-white" href="#sign-in">Talk to us</a>
      </nav>

      <div className="ion-login-position pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-8">
        <form
          id="sign-in"
          className="ion-login-panel pointer-events-auto w-[min(22rem,calc(100vw-4rem))] rounded-[22px] px-6 py-6 sm:px-7"
          onSubmit={handleSubmit}
          aria-busy={submitting}
        >
          <h2 className="ion-display mb-5 text-center text-[28px] leading-none">Sign in</h2>
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

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-104px)] max-w-7xl flex-col justify-end px-8 pb-20" aria-labelledby="ion-headline">
        <div className="ion-hero-copy">
          <p className="ion-enter ion-enter-eyebrow mb-5 text-[11px] font-medium uppercase tracking-[0.42em] text-white/45">Industrial Intelligence</p>
          <h1 id="ion-headline" className="ion-display ion-enter ion-enter-headline max-w-[13ch] text-5xl leading-[0.95] tracking-[-0.02em] sm:text-6xl md:text-7xl">
            Factories that<br /><em className="not-italic text-white/[0.48]">think ahead.</em>
          </h1>
          <div className="ion-enter ion-enter-actions mt-8 flex items-center gap-6">
            <a className="rounded-full bg-white px-5 py-3 text-[12px] font-semibold text-[#04070f] transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" href="#sign-in">Book a Demo</a>
            <Link className="text-[12px] font-medium text-white/55 transition-colors hover:text-white focus-visible:text-white" href="/dashboard">See the Platform →</Link>
          </div>
        </div>

        <footer className="ion-footer-rail absolute bottom-5 left-8 right-8 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] uppercase tracking-[0.3em] text-white/25">
          <span>Est. 2020</span>
          <span className="hidden sm:inline">11 markets</span>
          <span>Carbon negative</span>
        </footer>
      </section>
    </main>
  );
}
