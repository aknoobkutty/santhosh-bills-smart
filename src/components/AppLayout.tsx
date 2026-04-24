import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Receipt, Package, Users, BarChart3, Sun, Moon, LogOut, Smartphone, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/products", label: "Products", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/exchanges", label: "Exchanges", icon: Repeat },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

export function AppLayout() {
  const { user, role, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground hidden md:flex flex-col no-print">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Smartphone className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Santhosh</div>
              <div className="text-xs text-muted-foreground">Mobiles</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="text-xs">
            <div className="font-medium truncate">{user?.email}</div>
            <div className="text-muted-foreground capitalize">{role ?? "loading…"}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={toggle} className="flex-1">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={handleSignOut} className="flex-1">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border z-40 flex items-center justify-between px-4 no-print">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Smartphone className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm">Santhosh Mobiles</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={toggle}>
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border z-40 flex no-print">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={cn("flex-1 py-2 flex flex-col items-center gap-0.5 text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}