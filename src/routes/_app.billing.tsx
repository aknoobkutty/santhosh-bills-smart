import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type Product = { id: string; name: string; price: number; gst_percent: number; stock_quantity: number };
type Customer = { id: string; name: string; phone: string | null };
type Line = { product_id: string; quantity: number };

function BillingPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recent, setRecent] = useState<{ id: string; invoice_number: string; grand_total: number; customer_name: string | null; created_at: string }[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: 1 }]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [{ data: p }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("products").select("id, name, price, gst_percent, stock_quantity").order("name"),
      supabase.from("customers").select("id, name, phone").order("name"),
      supabase.from("invoices").select("id, invoice_number, grand_total, customer_name, created_at").order("created_at", { ascending: false }).limit(10),
    ]);
    setProducts((p ?? []) as Product[]);
    setCustomers((c ?? []) as Customer[]);
    setRecent((r ?? []) as typeof recent);
  }
  useEffect(() => { loadAll(); }, []);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((ls) => [...ls, { product_id: "", quantity: 1 }]); }
  function removeLine(i: number) { setLines((ls) => ls.filter((_, idx) => idx !== i)); }

  const computed = lines.map((l) => {
    const p = products.find((pp) => pp.id === l.product_id);
    if (!p) return { sub: 0, gst: 0, total: 0, name: "", qty: l.quantity, price: 0, gstPct: 0 };
    const sub = Number(p.price) * l.quantity;
    const gst = (sub * Number(p.gst_percent)) / 100;
    return { sub, gst, total: sub + gst, name: p.name, qty: l.quantity, price: Number(p.price), gstPct: Number(p.gst_percent) };
  });
  const subtotal = computed.reduce((s, r) => s + r.sub, 0);
  const gstTotal = computed.reduce((s, r) => s + r.gst, 0);
  const grand = subtotal + gstTotal;

  async function submit() {
    if (lines.some((l) => !l.product_id || l.quantity <= 0)) return toast.error("Pick product & valid quantity for each line");
    setSaving(true);
    const cust = customers.find((c) => c.id === customerId);
    const { data, error } = await supabase.rpc("create_invoice", {
      _customer_id: customerId || null,
      _customer_name: cust?.name ?? walkInName ?? "",
      _customer_phone: cust?.phone ?? walkInPhone ?? "",
      _items: lines as unknown as never,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Invoice created");
    navigate({ to: "/invoice/$id", params: { id: data as string } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground">Create a new invoice</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-4">
            <h2 className="font-semibold">Customer</h2>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select existing customer (optional)" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} {c.phone && `· ${c.phone}`}</SelectItem>)}
              </SelectContent>
            </Select>
            {!customerId && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Walk-in Name</Label><Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} maxLength={100} /></div>
                <div><Label>Walk-in Phone</Label><Input value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} maxLength={20} /></div>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Items</h2>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
            {lines.map((l, i) => {
              const c = computed[i];
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <Label className="text-xs">Product</Label>
                    <Select value={l.product_id} onValueChange={(v) => setLine(i, { product_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id} disabled={p.stock_quantity <= 0}>
                            {p.name} (₹{Number(p.price).toFixed(0)}, stock {p.stock_quantity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value)) })} />
                  </div>
                  <div className="col-span-3 text-right text-sm pb-2">
                    <div className="font-medium">₹{c.total.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">incl {c.gstPct}% GST</div>
                  </div>
                  <div className="col-span-1 pb-1">
                    {lines.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5 space-y-3" style={{ background: "var(--gradient-subtle)" }}>
            <h2 className="font-semibold">Summary</h2>
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span>GST</span><span>₹{gstTotal.toFixed(2)}</span></div>
            <div className="border-t pt-3 flex justify-between font-bold text-lg"><span>Grand Total</span><span>₹{grand.toFixed(2)}</span></div>
            <Button className="w-full" onClick={submit} disabled={saving || grand <= 0}>
              <Receipt className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Create Invoice"}
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-3">Recent Invoices</h2>
            <ul className="space-y-2 text-sm">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link to="/invoice/$id" params={{ id: r.id }} className="flex justify-between hover:text-primary">
                    <span className="truncate">{r.invoice_number}</span>
                    <span className="font-medium">₹{Number(r.grand_total).toFixed(2)}</span>
                  </Link>
                </li>
              ))}
              {recent.length === 0 && <li className="text-muted-foreground">No invoices yet</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}