"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  isAuthenticated,
  isAdmin as checkIsAdmin,
  logout as authLogout,
  checkSubscription,
} from "@/lib/auth";
import { LoginForm } from "./login-form";
import { SubscriptionInactive } from "./subscription-inactive";

type AuthState =
  | "loading"         // reading localStorage / validating
  | "unauthenticated"
  | "authenticated"
  | "inactive"        // subscription turned off
  | "grace_expired";  // offline and grace period ran out

interface AuthContextValue {
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue>({ logout: () => {}, isAdmin: false });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");

  const runCheck = useCallback(async () => {
    if (!isAuthenticated()) {
      setState("unauthenticated");
      return;
    }

    const result = await checkSubscription();

    switch (result) {
      case "valid":
      case "revalidated":
      case "grace":
        setState("authenticated");
        break;
      case "inactive":
        setState("inactive");
        break;
      case "grace_expired":
        setState("grace_expired");
        break;
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const logout = useCallback(() => {
    authLogout();
    setState("unauthenticated");
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setState("authenticated");
  }, []);

  if (state === "loading") return null;

  if (state === "unauthenticated") {
    return <LoginForm onSuccess={handleLoginSuccess} />;
  }

  if (state === "inactive") {
    return (
      <SubscriptionInactive
        reason="inactive"
        onLogout={() => setState("unauthenticated")}
      />
    );
  }

  if (state === "grace_expired") {
    return (
      <SubscriptionInactive
        reason="grace_expired"
        onLogout={() => setState("unauthenticated")}
      />
    );
  }

  return (
    <AuthContext.Provider value={{ logout, isAdmin: checkIsAdmin() }}>
      {children}
    </AuthContext.Provider>
  );
}
