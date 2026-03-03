"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLogin } from "@/lib/hooks";
import Button from "@/components/ui/Button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => router.push("/truckers") }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy">
      <div className="w-full max-w-[400px] mx-4">
        <div className="text-center mb-8">
          <h1 className="font-mono text-2xl font-bold text-white tracking-wide">
            TRUCKFLOW
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Operations Management Platform
          </p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 shadow-xl">
          <h2 className="text-base font-semibold text-navy mb-5">Sign In</h2>

          <div className="flex flex-col gap-[5px] mb-4">
            <label className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
              placeholder="admin@truckflow.com"
            />
          </div>

          <div className="flex flex-col gap-[5px] mb-5">
            <label className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
              placeholder="Password123!"
            />
          </div>

          {login.isError && (
            <div className="bg-red-bg border border-red/30 rounded-md px-3 py-2 mb-4 text-xs text-red">
              {login.error?.message || "Login failed"}
            </div>
          )}

          <Button
            type="submit"
            disabled={login.isPending}
            className="w-full justify-center"
          >
            {login.isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
