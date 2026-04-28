import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Repeat, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/exchanges")({
  component: ExchangesPage,
});

type Exchange = {
  id: string;
  seller_name: string;
  mobile_number: string;
  imei: string;
  model: string;
  brand: string;
  condition_summary: string;
  valuation: number;
  status: "pending" | "accepted" | "rejected";
  notes: string | null;
  created_at: string;
  exchange_value: number;
  exchange_date: string;
  accessories: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
};

const empty = {
  seller_name: "",
  mobile_number: "",
  imei: "",
  model: "",
  brand: "",
  condition_summary: "",
  valuation: 0,
  status: "pending" as Exchange["status"],
  notes: "",
  exchange_value: 0,
  exchange_date: new Date().toISOString().slice(0, 10),
  accessories: "",
  id_proof_type: "none",
  id_proof_number: "",
};

function ExchangesPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Exchange[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exchange | null>(null);
  const [form, setForm] = useState({ ...empty });

  async function load() {
    const { data, error } = await supabase
      .from("mobile_exchanges")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setItems((data ?? []) as Exchange[]);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...empty });
    setOpen(true);
  }
  function openEdit(e: Exchange) {
    setEditing(e);
    setForm({
      seller_name: e.seller_name,
      mobile_number: e.mobile_number,
      imei: e.imei,
      model: e.model,
      brand: e.brand,
      condition_summary: e.condition_summary,
      valuation: Number(e.valuation),
      status: e.status,
      notes: e.notes ?? "",
      exchange_value: Number(e.exchange_value ?? 0),
      exchange_date: e.exchange_date ?? new Date().toISOString().slice(0, 10),
      accessories: e.accessories ?? "",
      id_proof_type: e.id_proof_type ?? "none",
      id_proof_number: e.id_proof_number ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.seller_name.trim() || !form.mobile_number.trim() || !form.imei.trim() || !form.model.trim() || !form.brand.trim() || !form.condition_summary.trim()) {
      return toast.error("Please fill all required fields");
    }
    const payload = {
      seller_name: form.seller_name.trim(),
      mobile_number: form.mobile_number.trim(),
      imei: form.imei.trim(),
      model: form.model.trim(),
      brand: form.brand.trim(),
      condition_summary: form.condition_summary.trim(),
      valuation: Number(form.valuation) || 0,
      status: form.status,
      notes: form.notes?.trim() || null,
      exchange_value: Number(form.exchange_value) || 0,
      exchange_date: form.exchange_date,
      accessories: form.accessories?.trim() || null,
      id_proof_type: form.id_proof_type === "none" ? null : form.id_proof_type,
      id_proof_number: form.id_proof_number?.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("mobile_exchanges").update(payload).eq("id", editing.id)
      : await supabase.from("mobile_exchanges").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Exchange updated" : "Exchange recorded");
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this exchange record?")) return;
    const { error } = await supabase.from("mobile_exchanges").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  function generateBill(e: Exchange) {
    const amount = Number(e.exchange_value || e.valuation || 0);
    if (amount <= 0) return toast.error("Set an Exchange Value before billing");
    navigate({ to: "/billing", search: { type: "exchange", id: e.id } });
  }

  const filtered = items.filter((i) => {
    const s = q.toLowerCase();
    return !s || i.seller_name.toLowerCase().includes(s) || i.mobile_number.includes(s) || i.imei.toLowerCase().includes(s) || i.model.toLowerCase().includes(s) || i.brand.toLowerCase().includes(s);
  });

  const statusVariant = (s: Exchange["status"]) =>
    s === "accepted" ? "default" : s === "rejected" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Repeat className="h-6 w-6 sm:h-7 sm:w-7" />Mobile Exchanges</h1>
          <p className="text-sm text-muted-foreground">Track old mobiles taken in exchange</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />New Exchange</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit Exchange" : "Record Exchange"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Seller Name *</Label><Input value={form.seller_name} onChange={(e) => setForm({ ...form, seller_name: e.target.value })} maxLength={100} /></div>
              <div><Label>Mobile Number *</Label><Input value={form.mobile_number} onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} maxLength={20} /></div>
              <div className="sm:col-span-2"><Label>IMEI ID *</Label><Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} maxLength={20} placeholder="15-digit IMEI" /></div>
              <div><Label>Brand *</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Apple, Samsung…" maxLength={50} /></div>
              <div><Label>Model *</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="iPhone 11, Galaxy S21…" maxLength={100} /></div>
              <div className="sm:col-span-2"><Label>Condition Summary *</Label><Textarea value={form.condition_summary} onChange={(e) => setForm({ ...form, condition_summary: e.target.value })} placeholder="Good / Screen cracked / Battery issue…" maxLength={500} /></div>
              <div><Label>Valuation (₹)</Label><Input type="number" min="0" value={form.valuation} onChange={(e) => setForm({ ...form, valuation: Number(e.target.value) })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Exchange["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Exchange Value (₹)</Label><Input type="number" min="0" value={form.exchange_value} onChange={(e) => setForm({ ...form, exchange_value: Number(e.target.value) })} /></div>
              <div><Label>Date of Exchange</Label><Input type="date" value={form.exchange_date} onChange={(e) => setForm({ ...form, exchange_date: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Accessories Included</Label><Input value={form.accessories} onChange={(e) => setForm({ ...form, accessories: e.target.value })} placeholder="Charger, box, earphones…" maxLength={200} /></div>
              <div>
                <Label>ID Proof Type</Label>
                <Select value={form.id_proof_type} onValueChange={(v) => setForm({ ...form, id_proof_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="aadhaar">Aadhaar</SelectItem>
                    <SelectItem value="pan">PAN Card</SelectItem>
                    <SelectItem value="driving_license">Driving License</SelectItem>
                    <SelectItem value="voter_id">Voter ID</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>ID Proof Number</Label><Input value={form.id_proof_number} onChange={(e) => setForm({ ...form, id_proof_number: e.target.value })} maxLength={50} disabled={form.id_proof_type === "none"} /></div>
              <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
            </div>
            <Button onClick={save} className="w-full">{editing ? "Update" : "Save"}</Button>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by seller, phone, IMEI, brand, model…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
        <div className="inline-block min-w-full align-middle px-3 sm:px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>IMEI</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="text-right">Exchange ₹</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs whitespace-nowrap">{e.exchange_date ? new Date(e.exchange_date).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="font-medium">{e.seller_name}</TableCell>
                <TableCell>{e.mobile_number}</TableCell>
                <TableCell>{e.brand} {e.model}</TableCell>
                <TableCell className="font-mono text-xs">{e.imei}</TableCell>
                <TableCell className="max-w-xs truncate">{e.condition_summary}</TableCell>
                <TableCell className="text-right">₹{Number(e.exchange_value ?? e.valuation).toFixed(2)}</TableCell>
                <TableCell><Badge variant={statusVariant(e.status)} className="capitalize">{e.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Generate Bill" onClick={() => generateBill(e)}>
                    <Receipt className="h-4 w-4 text-primary" />
                  </Button>
                  {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No exchange records</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        </div>
      </Card>
    </div>
  );
}
