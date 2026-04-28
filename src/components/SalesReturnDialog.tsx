import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Undo2, Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";

type RefundMethod = "cash" | "card" | "upi" | "store_credit";

type Invoice = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  grand_total: number;
  created_at: string;
  invoice_type: string | null;
};

type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  line_total: number;
};

type ReturnRow = { invoice_item_id: string; quantity: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function SalesReturnDialog({ open, onOpenChange, onSuccess }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Invoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [alreadyReturned, setAlreadyReturned] = useState<Record<string, number>>({});
  const [returns, setReturns] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch(""); setResults([]); setInvoice(null); setItems([]);
      setAlreadyReturned({}); setReturns({}); setReason(""); setMethod("cash");
    }
  }, [open]);

  async function doSearch() {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    let query = supabase.from("invoices").select("id, invoice_number, customer_name, customer_phone, grand_total, created_at, invoice_type");
    if (/^\+?\d[\d\s-]{4,}$/.test(q)) {
      query = query.ilike("customer_phone", `%${q.replace(/[^\d]/g, "")}%`);
    } else {
      query = query.ilike("invoice_number", `%${q}%`);
    }
    const { data, error } = await query.order("created_at", { ascending: false }).limit(20);
    setSearching(false);
    if (error) return toast.error(error.message);
    setResults((data ?? []) as Invoice[]);
    if ((data ?? []).length === 0) toast.message("No matching invoices");
  }

  async function pickInvoice(inv: Invoice) {
    setInvoice(inv);
    const [{ data: it, error: e1 }, { data: ret, error: e2 }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", inv.id),
      supabase.from("sales_returns").select("invoice_item_id, quantity").eq("invoice_id", inv.id),
    ]);
    if (e1) return toast.error(e1.message);
    if (e2) return toast.error(e2.message);
    setItems((it ?? []) as InvoiceItem[]);
    const map: Record<string, number> = {};
    for (const r of (ret ?? []) as { invoice_item_id: string | null; quantity: number }[]) {
      if (!r.invoice_item_id) continue;
      map[r.invoice_item_id] = (map[r.invoice_item_id] ?? 0) + Number(r.quantity);
    }
    setAlreadyReturned(map);
    setReturns({});
  }

  const summary = useMemo(() => {
    let sub = 0, gst = 0;
    for (const it of items) {
      const q = returns[it.id] ?? 0;
      if (q <= 0) continue;
      const s = Number(it.unit_price) * q;
      const g = (s * Number(it.gst_percent)) / 100;
      sub += s; gst += g;
    }
    return { sub, gst, total: sub + gst };
  }, [items, returns]);

  function setQty(itemId: string, value: number, max: number) {
    const v = Math.max(0, Math.min(max, Math.floor(value || 0)));
    setReturns((r) => ({ ...r, [itemId]: v }));
  }

  async function submit() {
    if (!invoice) return;
    const payload: ReturnRow[] = Object.entries(returns)
      .filter(([, q]) => q > 0)
      .map(([invoice_item_id, quantity]) => ({ invoice_item_id, quantity }));
    if (payload.length === 0) return toast.error("Select at least one item to return");

    setSaving(true);
    const { error } = await supabase.rpc("create_sales_return", {
      _invoice_id: invoice.id,
      _items: payload as unknown as never,
      _payment_method: method,
      _return_reason: reason || (null as unknown as string),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Refund recorded · ₹${summary.total.toFixed(2)}`);
    onSuccess?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" />Sales Return</DialogTitle>
          <DialogDescription>Search an invoice, pick items, and process a refund.</DialogDescription>
        </DialogHeader>

        {!invoice ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="Invoice number or customer phone…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button onClick={doSearch} disabled={searching}>{searching ? "…" : "Search"}</Button>
            </div>
            {results.length > 0 && (
              <Card className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Invoice</TableHead><TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                        <TableCell>{r.customer_name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right font-medium">₹{Number(r.grand_total).toFixed(2)}</TableCell>
                        <TableCell><Button size="sm" onClick={() => pickInvoice(r)}>Select</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{invoice.invoice_number}</div>
                    <div className="font-semibold">{invoice.customer_name ?? "Walk-in"}</div>
                    {invoice.customer_phone && <div className="text-sm text-muted-foreground">{invoice.customer_phone}</div>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setInvoice(null)}>Change</Button>
                </div>
              </Card>

              <Card className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right w-28">Return Qty</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {items.map((it) => {
                      const ret = alreadyReturned[it.id] ?? 0;
                      const remaining = it.quantity - ret;
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="font-medium">{it.product_name}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{ret}</TableCell>
                          <TableCell className="text-right">₹{Number(it.unit_price).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(it.gst_percent)}%</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number" min={0} max={remaining}
                              value={returns[it.id] ?? ""}
                              disabled={remaining <= 0}
                              onChange={(e) => setQty(it.id, Number(e.target.value), remaining)}
                              placeholder={remaining <= 0 ? "—" : `max ${remaining}`}
                              className="h-8 text-right"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {items.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No items on this invoice</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>

              <div>
                <Label className="text-xs">Return Reason (optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. defective, wrong model, customer changed mind…" />
              </div>
            </div>

            <div>
              <Card className="p-4 space-y-3" style={{ background: "var(--gradient-subtle)" }}>
                <h3 className="font-semibold">Refund Summary</h3>
                <div className="flex justify-between text-sm"><span>Subtotal</span><span>₹{summary.sub.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span>GST</span><span>₹{summary.gst.toFixed(2)}</span></div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg"><span>Total Refund</span><span>₹{summary.total.toFixed(2)}</span></div>

                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs">Refund Method</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as RefundMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash"><span className="inline-flex items-center gap-2"><Banknote className="h-4 w-4" />Cash</span></SelectItem>
                      <SelectItem value="upi"><span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4" />UPI</span></SelectItem>
                      <SelectItem value="card"><span className="inline-flex items-center gap-2"><CreditCard className="h-4 w-4" />Card</span></SelectItem>
                      <SelectItem value="store_credit"><span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4" />Store Credit</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full" onClick={submit} disabled={saving || summary.total <= 0}>
                  <Undo2 className="h-4 w-4 mr-2" />{saving ? "Processing…" : "Confirm Return"}
                </Button>
                <p className="text-xs text-muted-foreground">Stock for product items will be restored automatically.</p>
              </Card>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
