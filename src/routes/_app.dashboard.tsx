import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Receipt, IndianRupee, TrendingUp, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [stats, setStats] = useState({ todaySales: 0, todayCount: 0, totalRevenue: 0, lowStock: [] as { id: string; name: string; stock_quantity: number }[] });

  useEffect(() => {
    (async () => {
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const { data: today } = await supabase
        .from("invoices")
        .select("grand_total")
        .gte("created_at", startToday.toISOString());
      const { data: all } = await supabase.from("invoices").select("grand_total");
      const { data: low } = await supabase
        .from("products")
        .select("id, name, stock_quantity, low_stock_threshold")
        .order("stock_quantity", { ascending: true })
        .limit(20);
      const lowFiltered = (low ?? []).filter((p) => p.stock_quantity <= p.low_stock_threshold);
      setStats({
        todaySales: (today ?? []).reduce((s, r) => s + Number(r.grand_total), 0),
        todayCount: today?.length ?? 0,
        totalRevenue: (all ?? []).reduce((s, r) => s + Number(r.grand_total), 0),
        lowStock: lowFiltered,
      });
    })();
  }, []);

  const cards = [
    { label: "Today's Sales", value: `₹${stats.todaySales.toFixed(2)}`, icon: IndianRupee, color: "from-primary to-primary-glow" },
    { label: "Today's Invoices", value: stats.todayCount, icon: Receipt, color: "from-success to-success" },
    { label: "Total Revenue", value: `₹${stats.totalRevenue.toFixed(2)}`, icon: TrendingUp, color: "from-accent to-primary" },
    { label: "Low Stock Items", value: stats.lowStock.length, icon: AlertTriangle, color: "from-warning to-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your shop's performance</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{c.value}</p>
              </div>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
                <c.icon className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> Low Stock Alerts
        </h2>
        {stats.lowStock.length === 0 ? (
          <p className="text-sm text-muted-foreground">All products are well stocked.</p>
        ) : (
          <ul className="divide-y">
            {stats.lowStock.map((p) => (
              <li key={p.id} className="py-2 flex justify-between text-sm">
                <span>{p.name}</span>
                <span className="font-medium text-destructive">{p.stock_quantity} left</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}