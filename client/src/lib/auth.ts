"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, AuthTokens } from "@/types";

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  setAuth: (user: User, tokens: AuthTokens) => void;
  setTokens: (tokens: AuthTokens) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isSupervisorOrAdmin: () => boolean;
  canCreateInvoice: () => boolean;
  canCreateLoad: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      setAuth: (user, tokens) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      logout: () => set({ user: null, tokens: null }),
      isAdmin: () => get().user?.role === "admin",
      isSupervisorOrAdmin: () => {
        const role = get().user?.role;
        return role === "admin" || role === "supervisor";
      },
      canCreateInvoice: () => {
        const role = get().user?.role;
        return role === "admin" || role === "supervisor" || role === "dispatcher" || role === "sales_and_dispatcher";
      },
      canCreateLoad: () => {
        const role = get().user?.role;
        return role === "admin" || role === "supervisor" || role === "dispatcher" || role === "sales_and_dispatcher";
      },
    }),
    { name: "truckflow-auth" }
  )
);
