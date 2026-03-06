"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useForgotPassword } from "@/lib/hooks";
import Button from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const forgotPassword = useForgotPassword();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    forgotPassword.mutate(email, {
      onSuccess: () => setSubmitted(true),
    });
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
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <h2 className="text-base font-semibold text-navy mb-2">Forgot Password</h2>

          {submitted ? (
            <div>
              <div className="bg-green-50 border border-green-200 rounded-md px-3 py-3 mb-4 text-xs text-green-700">
                If an account exists with that email, we&apos;ve sent a password reset link. Please check your inbox.
              </div>
              <Link href="/login" className="text-xs text-blue-600 hover:underline">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-xs text-txt-light mb-4">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

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
                  placeholder="your@email.com"
                />
              </div>

              {forgotPassword.isError && (
                <div className="bg-red-bg border border-red/30 rounded-md px-3 py-2 mb-4 text-xs text-red">
                  {forgotPassword.error?.message || "Something went wrong"}
                </div>
              )}

              <Button
                type="submit"
                disabled={forgotPassword.isPending}
                className="w-full justify-center"
              >
                {forgotPassword.isPending ? "Sending..." : "Send Reset Link"}
              </Button>

              <div className="mt-4 text-center">
                <Link href="/login" className="text-xs text-blue-600 hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
