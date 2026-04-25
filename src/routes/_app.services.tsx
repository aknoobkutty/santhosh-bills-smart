import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus, Pencil, Trash2, Search, Wrench, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/services")({
  component: ServicesPage,
});

type ServiceType = "hardware" | "software" | "both";
type ServiceStatus = "pending" | "in_progress" | "completed" | "delivered" | "cancelled";
type PasswordType = "pattern" | "alphanumeric" | "pin" | "not_preferred" | "none";

type Service = {
  id: string;
  customer_name: string;
  mobile_number: string;
  device_model: string;
  brand: string;
  imei: string | null;
  problem_description: string;
  service_type: ServiceType;
  service_status: ServiceStatus;
  estimated_cost: number;
  final_cost: number;
  technician_name: string | null;
  service_date: string;
  delivery_date: string | null;
  password_type: PasswordType;
  password_value: string | null;
  notes: string | null;
  created_at: string;
};

const empty = {
  customer_name: "",
  mobile_number: "",
  device_model: "",
  brand: "",
  imei: "",
  problem_description: "",
  service_type: "hardware" as ServiceType,
  service_status: "pending" as ServiceStatus,
  estimated_cost: 0,
  final_cost: 0,
  technician_name: "",
  service_date: new Date().toISOString().slice(0, 10),
  delivery_date: "",
  password_type: "none" as PasswordType,
  password_value: "",
  notes: "",
};

const STATUS_OPTIONS: { value: ServiceStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function ServicesPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Service[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ServiceStatus>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({ ...empty });

  async function load() {
    const { data, error } = await supabase
      .from("mobile_services")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setItems((data ?? []) as Service[]);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...empty });
    setOpen(true);
  }
  function openEdit(s: Service) {
    setEditing(s);
    setForm({
      customer_name: s.customer_name,
      mobile_number: s.mobile_number,
      device_model: s.device_model,
      brand: s.brand,
      imei: s.imei ?? "",
      problem_description: s.problem_description,
      service_type: s.service_type,
      service_status: s.service_status,
      estimated_cost: Number(s.estimated_cost) || 0,
      final_cost: Number(s.final_cost) || 0,
      technician_name: s.technician_name ?? "",
      service_date: s.service_date ?? new Date().toISOString().slice(0, 10),
      delivery_date: s.delivery_date ?? "",
      password_type: s.password_type,
      password_value: s.password_value ?? "",
      notes: s.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.customer_name.trim() || !form.mobile_number.trim() || !form.device_model.trim() || !form.brand.trim() || !form.problem_description.trim()) {
      return toast.error("Please fill all required fields");
    }
    const passwordDisabled = form.password_type === "none" || form.password_type === "not_preferred";
    const payload = {
      customer_name: form.customer_name.trim(),
      mobile_number: form.mobile_number.trim(),
      device_model: form.device_model.trim(),
      brand: form.brand.trim(),
      imei: form.imei?.trim() || null,
      problem_description: form.problem_description.trim(),
      service_type: form.service_type,
      service_status: form.service_status,
      estimated_cost: Number(form.estimated_cost) || 0,
      final_cost: Number(form.final_cost) || 0,
      technician_name: form.technician_name?.trim() || null,
      service_date: form.service_date,
      delivery_date: form.delivery_date || null,
      password_type: form.password_type,
      password_value: passwordDisabled ? null : (form.password_value?.trim() || null),
      notes: form.notes?.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("mobile_services").update(payload).eq("id", editing.id)
      : await supabase.from("mobile_services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Service updated" : "Service created");
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this service record?")) return;
    const { error } = await supabase.from("mobile_services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  const filtered = items.filter((i) => {
    if (statusFilter !== "all" && i.service_status !== statusFilter) return false;
    const s = q.toLowerCase();
    return !s ||
      i.customer_name.toLowerCase().includes(s) ||
      i.mobile_number.includes(s) ||
      (i.imei ?? "").toLowerCase().includes(s) ||
      i.device_model.toLowerCase().includes(s) ||
      i.brand.toLowerCase().includes(s) ||
      (i.technician_name ?? "").toLowerCase().includes(s);
  });

  const statusVariant = (s: ServiceStatus): "default" | "destructive" | "secondary" | "outline" =>
    s === "delivered" ? "default"
    : s === "completed" ? "default"
    : s === "cancelled" ? "destructive"
    : s === "in_progress" ? "outline"
    : "secondary";

  const passwordDisabled = form.password_type === "none" || form.password_type === "not_preferred";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 sm:h-7 sm:w-7" />Mobile Services</h1>
          <p className="text-sm text-muted-foreground">Manage repair & service requests</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />New Service</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit Service" : "New Service Request"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Customer Name *</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} maxLength={100} /></div>
              <div><Label>Mobile Number *</Label><Input value={form.mobile_number} onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} maxLength={20} /></div>
              <div><Label>Brand *</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Samsung, Apple…" maxLength={50} /></div>
              <div><Label>Device Model *</Label><Input value={form.device_model} onChange={(e) => setForm({ ...form, device_model: e.target.value })} placeholder="Redmi Note 10, iPhone 12…" maxLength={100} /></div>
              <div className="sm:col-span-2"><Label>IMEI Number</Label><Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} maxLength={20} placeholder="15-digit IMEI" /></div>
              <div className="sm:col-span-2"><Label>Problem Description *</Label><Textarea value={form.problem_description} onChange={(e) => setForm({ ...form, problem_description: e.target.value })} placeholder="Screen broken, not charging…" maxLength={500} /></div>
              <div>
                <Label>Service Type</Label>
                <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v as ServiceType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hardware">Hardware</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Service Status</Label>
                <Select value={form.service_status} onValueChange={(v) => setForm({ ...form, service_status: v as ServiceStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Estimated Cost (₹)</Label><Input type="number" min="0" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: Number(e.target.value) })} /></div>
              <div><Label>Final Cost (₹)</Label><Input type="number" min="0" value={form.final_cost} onChange={(e) => setForm({ ...form, final_cost: Number(e.target.value) })} /></div>
              <div><Label>Technician Name</Label><Input value={form.technician_name} onChange={(e) => setForm({ ...form, technician_name: e.target.value })} maxLength={100} /></div>
              <div><Label>Service Date</Label><Input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} /></div>
              <div><Label>Delivery Date</Label><Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} /></div>
              <div>
                <Label>Password Type</Label>
                <Select value={form.password_type} onValueChange={(v) => setForm({ ...form, password_type: v as PasswordType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pattern">Pattern Lock</SelectItem>
                    <SelectItem value="alphanumeric">Alphanumeric Password</SelectItem>
                    <SelectItem value="pin">PIN</SelectItem>
                    <SelectItem value="not_preferred">Not Preferred</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Password {passwordDisabled && <span className="text-xs text-muted-foreground">(disabled)</span>}</Label>
                <Input value={form.password_value} onChange={(e) => setForm({ ...form, password_value: e.target.value })} maxLength={100} disabled={passwordDisabled} placeholder={passwordDisabled ? "" : "Enter pattern/PIN/password"} />
              </div>
              <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
            </div>
            <Button onClick={save} className="w-full">{editing ? "Update" : "Save"}</Button>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by customer, phone, IMEI, brand, model, technician…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Filter status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <div className="inline-block min-w-full align-middle px-3 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Est ₹</TableHead>
                  <TableHead className="text-right">Final ₹</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(s.service_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{s.customer_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.mobile_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.brand} {s.device_model}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{s.problem_description}</TableCell>
                    <TableCell className="capitalize">{s.service_type}</TableCell>
                    <TableCell className="text-right">₹{Number(s.estimated_cost).toFixed(2)}</TableCell>
                    <TableCell className="text-right">₹{Number(s.final_cost).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={statusVariant(s.service_status)} className="capitalize whitespace-nowrap">{s.service_status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" asChild title="Generate Bill">
                        <Link to="/billing"><Receipt className="h-4 w-4 text-primary" /></Link>
                      </Button>
                      {isAdmin && <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No service records</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    </div>
  );
}