"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ApiError, api, type AuthUser } from "@/lib/api-client";
import { safeNextPath } from "@/lib/auth-paths";
import { FactoryProvider } from "@/lib/factory-context";
import { ProjectProvider } from "@/lib/project-context";

interface AuthContextValue {
  user: AuthUser;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PUBLIC_ROUTES = new Set(["/", "/login"]);

function ProtectedApplication({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    void api.auth.me().then((identity) => {
      if (active) setUser(identity);
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        const current = safeNextPath(`${pathname}${window.location.search}`);
        router.replace(`/?next=${encodeURIComponent(current)}`);
        return;
      }
      setError("Ion could not verify your session. Please try again.");
    });

    return () => { active = false; };
  }, [attempt, pathname, router]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
    router.replace("/");
    router.refresh();
  }, [router]);

  const value = useMemo(() => user ? { user, logout } : null, [logout, user]);

  if (error) {
    return (
      <main className="auth-boundary-state" role="alert">
        <span aria-hidden="true" />
        <strong>We could not verify your session.</strong>
        <p>{error}</p>
        <button type="button" onClick={() => { setError(""); setAttempt((current) => current + 1); }}>Try again</button>
      </main>
    );
  }

  if (!value) {
    return <main className="application-loading" role="status"><span /><strong>Verifying your secure session…</strong></main>;
  }

  return (
    <AuthContext.Provider value={value}>
      <FactoryProvider>
        <ProjectProvider>
          <AppShell>{children}</AppShell>
        </ProjectProvider>
      </FactoryProvider>
    </AuthContext.Provider>
  );
}

export function ApplicationBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_ROUTES.has(pathname)) return <>{children}</>;
  return <ProtectedApplication>{children}</ProtectedApplication>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an authenticated application.");
  return context;
}
