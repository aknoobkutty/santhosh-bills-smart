import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/invoice/$id")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: InvoicePage,
});

type Inv = {
  id: string; invoice_number: string; customer_name: string | null; customer_phone: string | null;
  subtotal: number; gst_total: number; grand_total: number; created_at: string;
  payment_method: string; amount_paid: number; change_returned: number;
};
type Item = { id: string; product_name: string; quantity: number; unit_price: number; gst_percent: number; line_total: number };

function InvoicePage() {
  const { id } = Route.useParams();
  const [inv, setInv] = useState<Inv | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      const { data: i } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
      const { data: its } = await supabase.from("invoice_items").select("*").eq("invoice_id", id);
      setInv(i as Inv | null);
      setItems((its ?? []) as Item[]);
    })();
  }, [id]);

  if (!inv) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto mb-4 flex justify-between no-print">
        <Button variant="outline" asChild><Link to="/billing"><ArrowLeft className="h-4 w-4 mr-2" />Back</Link></Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print / Save PDF</Button>
      </div>

      <div className="max-w-3xl mx-auto bg-card text-card-foreground p-10 rounded-lg print-area" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex justify-between items-start border-b pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Santhosh Mobiles</h1>
            <p className="text-sm text-muted-foreground">Mobile sales & accessories</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">INVOICE</p>
            <p className="font-mono font-bold">{inv.invoice_number}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(inv.created_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase">Bill To</p>
          <p className="font-medium">{inv.customer_name || "Walk-in Customer"}</p>
          {inv.customer_phone && <p className="text-sm text-muted-foreground">{inv.customer_phone}</p>}
        </div>

        <table className="w-full text-sm mb-6">
          <thead className="border-b">
            <tr className="text-left">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">GST</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">{it.product_name}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">₹{Number(it.unit_price).toFixed(2)}</td>
                <td className="py-2 text-right">{it.gst_percent}%</td>
                <td className="py-2 text-right">₹{Number(it.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>₹{Number(inv.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>₹{Number(inv.gst_total).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Grand Total</span><span>₹{Number(inv.grand_total).toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2"><span>Payment</span><span className="uppercase font-medium">{inv.payment_method}</span></div>
            {inv.payment_method === "cash" && (
              <>
                <div className="flex justify-between"><span>Cash Received</span><span>₹{Number(inv.amount_paid).toFixed(2)}</span></div>
                <div className="flex justify-between font-medium"><span>Change Returned</span><span>₹{Number(inv.change_returned).toFixed(2)}</span></div>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10 pt-6 border-t">Thank you for shopping with Santhosh Mobiles!</p>
      </div>
    </div>
  );
}