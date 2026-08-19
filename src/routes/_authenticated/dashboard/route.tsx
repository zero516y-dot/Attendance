import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Coffee, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const { profile, isOwner, can } = useMe();

  const tabs = [
    { to: "/dashboard", label: "Queue", show: true, exact: true },
    { to: "/dashboard/users", label: "Staff", show: isOwner || can("can_manage_staff") },
    { to: "/dashboard/reports", label: "Reports", show: isOwner || can("can_view_reports") },
    { to: "/dashboard/settings", label: "Cafe", show: isOwner || can("can_manage_staff") },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-foreground">
            <Coffee className="h-5 w-5 text-accent" />
            Brew Clock
          </Link>
          <nav className="flex flex-wrap gap-1">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  activeOptions={{ exact: "exact" in t ? t.exact : false }}
                  activeProps={{ className: "bg-secondary text-secondary-foreground" }}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/70"
                >
                  {t.label}
                </Link>
              ))}
            {(isOwner || can("can_access_qr_display")) && (
              <Link
                to="/qr-counter"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/70"
              >
                QR counter
              </Link>
            )}
            <Link
              to="/scan"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/70"
            >
              Scan
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-xs">
              <p className="font-medium text-foreground">{profile?.full_name ?? "…"}</p>
              <p className="text-muted-foreground">{profile?.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
