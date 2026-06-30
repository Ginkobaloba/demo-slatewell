import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { SlatewellLogo } from "@/components/slatewell-logo";
import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <SlatewellLogo className="text-base" />
          </Link>
        </div>
        <AdminNav />
        <div className="border-t border-border px-2 py-3">
          <form method="POST" action="/api/admin/session?signout=1">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar + content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <Link href="/admin">
            <SlatewellLogo className="text-base" />
          </Link>
          <form method="POST" action="/api/admin/session?signout=1">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </header>

        <main className="flex-1 bg-background p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
