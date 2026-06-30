"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  Users,
  UserCog,
  MessageSquare,
  Settings,
  Scissors,
  LayoutDashboard,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, active: true },
  { href: "/admin/schedule", label: "Schedule", icon: Calendar, active: true },
  { href: "/admin/services", label: "Services", icon: Scissors, active: true },
  { href: "/admin/staff", label: "Staff", icon: UserCog, active: true },
  { href: "/admin/customers", label: "Customers", icon: Users, active: false },
  {
    href: "/admin/communications",
    label: "Communications",
    icon: MessageSquare,
    active: false,
  },
  { href: "/admin/reports", label: "Reports", icon: BarChart3, active: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, active: false },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 px-2 py-3">
      {NAV.map(({ href, label, icon: Icon, active }) => {
        if (!active) {
          return (
            <span
              key={label}
              className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              <span className="ml-auto text-[10px]">soon</span>
            </span>
          );
        }
        const current =
          href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              current
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
