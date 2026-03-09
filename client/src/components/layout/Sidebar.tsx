"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { useMe } from "@/lib/hooks";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  adminOnly?: boolean;
  supervisorOnly?: boolean;
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { href: "/truckers", label: "Truckers", icon: "&#x1F69A;" },
      { href: "/upload", label: "Upload Data", icon: "&#x1F4C2;" },
      { href: "/onboarding", label: "Onboarding", icon: "&#x1F4CB;" },
      { href: "/truckers?tab=fully_onboarded", label: "Onboarded Truckers", icon: "&#x2705;" },
      { href: "/loads", label: "Loads / Orders", icon: "&#x1F4E6;" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/commissions", label: "Commissions", icon: "&#x1F4B0;" },
      { href: "/invoices", label: "Invoices", icon: "&#x1F4C4;" },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/people", label: "People", icon: "&#x1F465;", supervisorOnly: true },

      { href: "/chat", label: "Team Chat", icon: "&#x1F4AC;" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/audit-log", label: "Audit Log", icon: "&#x1F50D;", supervisorOnly: true },
      { href: "/settings", label: "Settings", icon: "&#x2699;", adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { data: me } = useMe();
  const role = user?.role ?? "viewer";
  const profileImageUrl = (me as Record<string, unknown> | undefined)?.profile_image_url as string | undefined;

  return (
    <aside className="w-[220px] bg-navy flex flex-col shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-4">
        <span className="font-mono text-[13px] font-semibold text-white tracking-wide">
          TRUCKFLOW
        </span>
        <span className="text-accent text-[10px] font-mono ml-1">CRM</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((section) => {
          const visibleItems = section.items.filter((item) => {
            if (item.adminOnly && role !== "admin") return false;
            if (item.supervisorOnly && role !== "admin" && role !== "supervisor") return false;
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="mb-3">
              <div className="px-5 py-1 text-[9px] font-mono uppercase tracking-[1.5px] text-white/25">
                {section.title}
              </div>
              {visibleItems.map((item) => {
                const active = item.href.includes("?")
                  ? pathname + (typeof window !== "undefined" ? window.location.search : "") === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-[18px] py-[9px] text-[13px] border-l-[3px] transition-all duration-100
                      ${active
                        ? "border-accent bg-blue/30 text-white"
                        : "border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white/80"
                      }`}
                  >
                    <span
                      className="w-[18px] text-center text-[15px]"
                      dangerouslySetInnerHTML={{ __html: item.icon }}
                    />
                    <span className="font-medium">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="ml-auto bg-accent text-white text-[10px] font-mono px-1.5 py-px rounded-[10px]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User footer — links to profile */}
      {user && (
        <Link href="/profile" className="block px-5 py-3 border-t border-white/10 hover:bg-white/[0.06] transition-colors">
          <div className="flex items-center gap-2.5">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt={user.full_name} className="w-[30px] h-[30px] rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-[30px] h-[30px] rounded-full bg-blue flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {user.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs text-white truncate">
                {user.full_name}
              </div>
              <div className="text-[10px] text-white/40 font-mono capitalize">{(user.role ?? "").replace(/_/g, " ")}</div>
            </div>
          </div>
        </Link>
      )}
    </aside>
  );
}
