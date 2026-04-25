import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Receipt, ScanLine, Banknote, CreditCard, Smartphone, Camera, Smartphone as PhoneIcon, Wrench } from "lucide-react";
import { toast } from "sonner";
import { CameraScannerDialog } from "@/components/CameraScannerDialog";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type Product = { id: string; name: string; price: number; gst_percent: number; stock_quantity: number; barcode?: string | null };
type Customer = { id: string; name: string; phone: string | null };
type Line = { product_id: string; quantity: number };
type PayMethod = "cash" | "card" | "upi";

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
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);
  const [camOpen, setCamOpen] = useState(false);

  async function loadAll() {
    const [{ data: p }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("products").select("*").order("name"),
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
  const change = payMethod === "cash" ? Math.max(0, (Number(amountPaid) || 0) - grand) : 0;
  const shortBy = payMethod === "cash" ? Math.max(0, grand - (Number(amountPaid) || 0)) : 0;

  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    processCode(scan);
  }

  function processCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    // Match by barcode field, or fallback to product id / name contains
    const p = products.find((pp) =>
      (pp.barcode && pp.barcode === code) || pp.id === code || pp.name.toLowerCase() === code.toLowerCase()
    );
    if (!p) {
      toast.error(`No product for code: ${code}`);
    } else if (p.stock_quantity <= 0) {
      toast.error(`${p.name} is out of stock`);
    } else {
      setLines((ls) => {
        const idx = ls.findIndex((l) => l.product_id === p.id);
        if (idx >= 0) return ls.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
        // Replace first empty line, else append
        const emptyIdx = ls.findIndex((l) => !l.product_id);
        if (emptyIdx >= 0) return ls.map((l, i) => (i === emptyIdx ? { product_id: p.id, quantity: 1 } : l));
        return [...ls, { product_id: p.id, quantity: 1 }];
      });
      toast.success(`Added ${p.name}`);
    }
    setScan("");
  }

  async function submit() {
    if (lines.some((l) => !l.product_id || l.quantity <= 0)) return toast.error("Pick product & valid quantity for each line");
    if (payMethod === "cash" && (Number(amountPaid) || 0) < grand) return toast.error(`Cash received is short by ₹${shortBy.toFixed(2)}`);
    setSaving(true);
    const cust = customers.find((c) => c.id === customerId);
    const { data, error } = await supabase.rpc("create_invoice", {
      _customer_id: customerId || (null as unknown as string),
      _customer_name: cust?.name ?? walkInName ?? "",
      _customer_phone: cust?.phone ?? walkInPhone ?? "",
      _items: lines as unknown as never,
      _payment_method: payMethod,
      _amount_paid: payMethod === "cash" ? Number(amountPaid) : grand,
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

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/exchanges"><PhoneIcon className="h-4 w-4 mr-2" />Mobile Exchange</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/services"><Wrench className="h-4 w-4 mr-2" />Service Invoice</Link>
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-2">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Barcode Scanner</h2>
            </div>
            <div className="flex gap-2">
              <Input
                ref={scanRef}
                autoFocus
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Scan / type code, press Enter"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={() => setCamOpen(true)}>
                <Camera className="h-4 w-4 mr-2" />Camera
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">USB/Bluetooth scanners act as keyboard input. Or tap Camera to scan barcode/QR using your device camera.</p>
            <CameraScannerDialog
              open={camOpen}
              onOpenChange={setCamOpen}
              onDetected={(code) => { setScan(code); processCode(code); }}
            />
          </Card>

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

            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "cash", label: "Cash", Icon: Banknote },
                  { v: "card", label: "Card", Icon: CreditCard },
                  { v: "upi", label: "UPI", Icon: Smartphone },
                ] as const).map(({ v, label, Icon }) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={payMethod === v ? "default" : "outline"}
                    onClick={() => setPayMethod(v)}
                    className="flex-col h-auto py-2"
                  >
                    <Icon className="h-4 w-4 mb-1" />
                    <span className="text-xs">{label}</span>
                  </Button>
                ))}
              </div>
              {payMethod === "cash" && (
                <div className="space-y-2 pt-1">
                  <Label className="text-xs">Cash Received</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid || ""}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                    placeholder="0.00"
                  />
                  {shortBy > 0 && (
                    <div className="flex justify-between text-sm text-destructive font-medium">
                      <span>Short by</span><span>₹{shortBy.toFixed(2)}</span>
                    </div>
                  )}
                  {change > 0 && (
                    <div className="flex justify-between text-sm font-bold text-primary bg-primary/10 px-2 py-1.5 rounded">
                      <span>Change to return</span><span>₹{change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

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