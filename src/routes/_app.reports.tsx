import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Search, Eye, TrendingUp, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type Inv = { id: string; invoice_number: string; customer_name: string | null; grand_total: number; created_at: string; invoice_type?: string | null; payment_method?: string | null };
type Ret = { id: string; return_number: string; invoice_id: string; product_name: string; quantity: number; refund_amount: number; payment_method: string; return_date: string; created_at: string };

function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

function ReportsPage() {
  const today = new Date();
  const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 7);
  const [from, setFrom] = useState(fmtDate(weekAgo));
  const [to, setTo] = useState(fmtDate(today));
  const [items, setItems] = useState<Inv[]>([]);
  const [returns, setReturns] = useState<Ret[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    const fromDt = new Date(from + "T00:00:00").toISOString();
    const toDt = new Date(to + "T23:59:59").toISOString();
    const [{ data }, { data: ret }] = await Promise.all([
      supabase.from("invoices")
        .select("id, invoice_number, customer_name, grand_total, created_at, invoice_type, payment_method")
        .gte("created_at", fromDt).lte("created_at", toDt)
        .order("created_at", { ascending: false }),
      supabase.from("sales_returns")
        .select("id, return_number, invoice_id, product_name, quantity, refund_amount, payment_method, return_date, created_at")
        .gte("created_at", fromDt).lte("created_at", toDt)
        .order("created_at", { ascending: false }),
    ]);
    setItems((data ?? []) as Inv[]);
    setReturns((ret ?? []) as Ret[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function preset(days: number) {
    const t = new Date(); const f = new Date(); f.setDate(t.getDate() - days);
    setFrom(fmtDate(f)); setTo(fmtDate(t));
  }

  const filtered = items.filter((i) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return i.invoice_number.toLowerCase().includes(q) || (i.customer_name ?? "").toLowerCase().includes(q);
  });
  const total = filtered.reduce((s, i) => s + Number(i.grand_total), 0);
  const refundTotal = returns.reduce((s, r) => s + Number(r.refund_amount), 0);
  const netSales = total - refundTotal;

  // Daily sales aggregation
  const dailyMap = new Map<string, { date: string; total: number; count: number }>();
  for (const i of filtered) {
    const d = new Date(i.created_at).toISOString().slice(0, 10);
    const cur = dailyMap.get(d) ?? { date: d, total: 0, count: 0 };
    cur.total += Number(i.grand_total);
    cur.count += 1;
    dailyMap.set(d, cur);
  }
  const dailyData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  // By invoice type
  const typeMap = new Map<string, number>();
  for (const i of filtered) {
    const k = (i.invoice_type ?? "product");
    typeMap.set(k, (typeMap.get(k) ?? 0) + Number(i.grand_total));
  }
  const typeData = Array.from(typeMap.entries()).map(([k, v]) => ({ type: k.replace("_", " "), total: Number(v.toFixed(2)) }));

  function exportCSV() {
    if (filtered.length === 0) { toast.error("Nothing to export"); return; }
    const header = ["Invoice", "Customer", "Date", "Grand Total"];
    const rows = filtered.map((i) => [
      i.invoice_number,
      (i.customer_name ?? "").replace(/"/g, '""'),
      new Date(i.created_at).toLocaleString(),
      Number(i.grand_total).toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `invoices_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Sales by date range</p>
      </div>

      <Card className="p-5 flex flex-wrap gap-3 items-end">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button onClick={load}>Apply</Button>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => preset(0)}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => preset(7)}>7d</Button>
          <Button variant="outline" size="sm" onClick={() => preset(30)}>30d</Button>
          <Button size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice number or customer name…"
            className="pl-9"
          />
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5"><p className="text-sm text-muted-foreground">Invoices</p><p className="text-2xl font-bold">{filtered.length}</p></Card>
        <Card className="p-5"><p className="text-sm text-muted-foreground">Total Sales</p><p className="text-2xl font-bold">₹{total.toFixed(2)}</p></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5"><p className="text-sm text-muted-foreground">Refunds ({returns.length})</p><p className="text-2xl font-bold text-destructive">- ₹{refundTotal.toFixed(2)}</p></Card>
        <Card className="p-5"><p className="text-sm text-muted-foreground">Net Sales</p><p className="text-2xl font-bold text-primary">₹{netSales.toFixed(2)}</p></Card>
      </div>

      <Card className="overflow-x-auto">
        <div className="p-4 flex items-center gap-2 border-b">
          <Undo2 className="h-4 w-4 text-destructive" />
          <h2 className="font-semibold">Sales Returns</h2>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Return #</TableHead><TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Method</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">Refund</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {returns.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No returns in this range</TableCell></TableRow>
            ) : returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.return_number}</TableCell>
                <TableCell>{r.product_name}</TableCell>
                <TableCell className="text-right">{r.quantity}</TableCell>
                <TableCell className="capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right font-medium text-destructive">- ₹{Number(r.refund_amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No invoices found</TableCell></TableRow>
            ) : filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">
                  <Link to="/invoice/$id" params={{ id: i.id }} className="text-primary hover:underline">{i.invoice_number}</Link>
                </TableCell>
                <TableCell>{i.customer_name ?? "—"}</TableCell>
                <TableCell>{new Date(i.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right font-medium">₹{Number(i.grand_total).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/invoice/$id" params={{ id: i.id }}>
                      <Eye className="h-4 w-4 mr-1" />View / Print
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Daily Sales Trend</h2>
          </div>
          <div className="h-64">
            {dailyData.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    formatter={(v: number) => [`₹${Number(v).toFixed(2)}`, "Sales"]}
                  />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Sales by Bill Type</h2>
          </div>
          <div className="h-64">
            {typeData.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="type" tick={{ fontSize: 12 }} className="capitalize" />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    formatter={(v: number) => [`₹${Number(v).toFixed(2)}`, "Total"]}
                  />
                  <Legend />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}