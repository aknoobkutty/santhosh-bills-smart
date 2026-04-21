import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

type Inv = { id: string; invoice_number: string; customer_name: string | null; grand_total: number; created_at: string };

function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

function ReportsPage() {
  const today = new Date();
  const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 7);
  const [from, setFrom] = useState(fmtDate(weekAgo));
  const [to, setTo] = useState(fmtDate(today));
  const [items, setItems] = useState<Inv[]>([]);

  async function load() {
    const fromDt = new Date(from + "T00:00:00").toISOString();
    const toDt = new Date(to + "T23:59:59").toISOString();
    const { data } = await supabase.from("invoices")
      .select("id, invoice_number, customer_name, grand_total, created_at")
      .gte("created_at", fromDt).lte("created_at", toDt)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Inv[]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function preset(days: number) {
    const t = new Date(); const f = new Date(); f.setDate(t.getDate() - days);
    setFrom(fmtDate(f)); setTo(fmtDate(t));
  }

  const total = items.reduce((s, i) => s + Number(i.grand_total), 0);

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
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5"><p className="text-sm text-muted-foreground">Invoices</p><p className="text-2xl font-bold">{items.length}</p></Card>
        <Card className="p-5"><p className="text-sm text-muted-foreground">Total Sales</p><p className="text-2xl font-bold">₹{total.toFixed(2)}</p></Card>
      </div>

      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No invoices in range</TableCell></TableRow>
            ) : items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                <TableCell>{i.customer_name ?? "—"}</TableCell>
                <TableCell>{new Date(i.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right font-medium">₹{Number(i.grand_total).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}