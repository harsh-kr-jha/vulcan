"use client";

import { ArrowRight, Bolt, CheckCircle2, Eye, EyeOff, Factory } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("harsh");
  const [password, setPassword] = useState("vulcan-demo");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    if (!API_URL) {
      router.push("/");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/auth/login/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail ?? "Unable to sign in.");
      }
      router.push("/");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark"><Bolt size={18} /></span>
          <span><strong>VULCAN</strong><small>Factory intelligence</small></span>
        </div>
        <div className="login-story-copy">
          <p className="eyebrow">Make every shift count</p>
          <h1>See the loss.<br /><span>Change the outcome.</span></h1>
          <p>One traceable operating picture—from raw factory sheets to the decisions that improve tomorrow’s shift.</p>
          <div className="login-benefits">
            <span><CheckCircle2 size={15} /> Production, OEE, quality and inventory in one view</span>
            <span><CheckCircle2 size={15} /> Every insight traceable to an approved source row</span>
            <span><CheckCircle2 size={15} /> Rule-based recommendations your teams can trust</span>
          </div>
        </div>
        <div className="login-plant-card">
          <span><Factory size={17} /></span>
          <div><strong>Pune Plant 01</strong><small>Live · Shift A</small></div>
          <b>71.8% OEE</b>
        </div>
      </section>

      <section className="login-form-section">
        <form className="login-form" onSubmit={submit}>
          <div>
            <span className="login-welcome">Welcome back</span>
            <h2>Sign in to your factory</h2>
            <p>Use your organisation account to continue.</p>
          </div>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label>
            Password
            <span className="password-field">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
          {error && <p className="login-error">{error}</p>}
          <div className="login-options"><label><input type="checkbox" defaultChecked /> Remember me</label><button type="button">Forgot password?</button></div>
          <button className="button button-accent login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"} <ArrowRight size={15} />
          </button>
          <p className="login-demo-note">Local demo: harsh / vulcan-demo</p>
        </form>
      </section>
    </main>
  );
}
