"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const tokens = useAuthStore((s) => s.tokens);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !tokens?.access_token) {
      router.replace("/login");
    }
  }, [mounted, tokens, router]);

  // Always render the same loading state on server and initial client render
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-txt-light text-sm">Loading...</div>
      </div>
    );
  }

  if (!tokens?.access_token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-txt-light text-sm">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
    </div>
  );
}
