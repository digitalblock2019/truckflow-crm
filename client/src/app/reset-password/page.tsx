"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useResetPassword } from "@/lib/hooks";
import Button from "@/components/ui/Button";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const router = useRouter();
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (!token) { setError("Invalid reset link — no token found"); return; }

    resetPassword.mutate(
      { token, new_password: password },
      {
        onSuccess: () => setSuccess(true),
        onError: (err: any) => setError(err.message || "Reset failed"),
      }
    );
  };

  if (!token) {
    return (
      <div>
        <div className="bg-red-bg border border-red/30 rounded-md px-3 py-3 mb-4 text-xs text-red">
          Invalid reset link. Please request a new password reset.
        </div>
        <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">
          Request New Reset Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div>
        <div className="bg-green-50 border border-green-200 rounded-md px-3 py-3 mb-4 text-xs text-green-700">
          Password reset successfully! You can now sign in with your new password.
        </div>
        <Button onClick={() => router.push("/login")} className="w-full justify-center">
          Go to Sign In
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="text-xs text-txt-light mb-4">
        Enter your new password below.
      </p>

      <div className="flex flex-col gap-[5px] mb-4">
        <label className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
          New Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
          placeholder="Min 8 characters"
        />
      </div>

      <div className="flex flex-col gap-[5px] mb-5">
        <label className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide">
          Confirm Password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
          placeholder="Re-enter password"
        />
      </div>

      {error && (
        <div className="bg-red-bg border border-red/30 rounded-md px-3 py-2 mb-4 text-xs text-red">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={resetPassword.isPending}
        className="w-full justify-center"
      >
        {resetPassword.isPending ? "Resetting..." : "Reset Password"}
      </Button>

      <div className="mt-4 text-center">
        <Link href="/login" className="text-xs text-blue-600 hover:underline">
          Back to Sign In
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
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
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <h2 className="text-base font-semibold text-navy mb-2">Reset Password</h2>
          <Suspense fallback={<div className="text-xs text-txt-light py-4 text-center">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
