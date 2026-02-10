import { createContext, useContext } from "react";

export interface AuthContext {
  userId: string;
  email: string;
  onSignOut: () => void;
}

export const AuthCtx = createContext<AuthContext | null>(null);

export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) return { userId: "", email: "", onSignOut: () => {} };
  return ctx;
}
