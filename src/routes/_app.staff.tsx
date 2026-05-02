import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Printer, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { adminCreateStaff, adminDeleteStaff, adminResetStaffPassword } from "@/server/staff-admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_app/staff")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) {
      const { redirect } = await import("@tanstack/react-router");
      throw redirect({ to: "/dashboard" });
    }
  },
  component: StaffPage,
});

type Staff = {
  id: string;
  user_id: string | null;
  name: string;
  role: "admin" | "staff";
  phone: string | null;
  email: string;
  salary: number;
  join_date: string;
  status: "active" | "inactive";
  notes: string | null;
};

type Attendance = {
  id: string;
  staff_id: string;
  attendance_date: string;
  status: "present" | "absent" | "leave";
  notes: string | null;
};

type SalaryRec = {
  id: string;
  staff_id: string;
  month: string;
  total_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  base_salary: number;
  salary_paid: number;
  paid_on: string | null;
};

function StaffPage() {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Staff Management</h1>
        <p className="text-muted-foreground">Manage team, attendance and payroll</p>
      </div>

      <Tabs defaultValue="staff" className="space-y-4">
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="staff"><StaffTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="payroll"><PayrollTab isAdmin={isAdmin} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------- STAFF TAB --------------------------- */
function StaffTab({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Staff[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const empty = { name: "", role: "staff" as "admin" | "staff", phone: "", email: "", password: "", salary: "0", join_date: new Date().toISOString().slice(0, 10), status: "active" as "active" | "inactive", notes: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const createFn = useServerFn(adminCreateStaff);
  const deleteFn = useServerFn(adminDeleteStaff);
  const resetFn = useServerFn(adminResetStaffPassword);

  async function load() {
    const { data, error } = await supabase.from("staff").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setItems((data ?? []) as Staff[]);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(s: Staff) {
    setEditing(s);
    setForm({
      name: s.name, role: s.role, phone: s.phone ?? "", email: s.email, password: "",
      salary: String(s.salary), join_date: s.join_date, status: s.status, notes: s.notes ?? "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return toast.error("Admin only");
    if (!form.name.trim()) return toast.error("Name required");
    if (!form.email.trim()) return toast.error("Email required");
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          name: form.name.trim(),
          role: form.role,
          phone: form.phone.trim() || null,
          email: form.email.trim().toLowerCase(),
          salary: Number(form.salary) || 0,
          join_date: form.join_date,
          status: form.status,
          notes: form.notes.trim() || null,
        };
        const { error } = await supabase.from("staff").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
        toast.success("Updated");
      } else {
        if (form.password.length < 8) throw new Error("Password must be at least 8 characters");
        await createFn({
          data: {
            email: form.email.trim().toLowerCase(),
            password: form.password,
            full_name: form.name.trim(),
            phone: form.phone.trim() || null,
            salary: Number(form.salary) || 0,
            role: form.role,
          },
        });
        toast.success("Staff account created");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Staff) {
    if (!confirm("Delete this staff member and their login account?")) return;
    try {
      if (s.user_id) {
        await deleteFn({ data: { user_id: s.user_id } });
      } else {
        const { error } = await supabase.from("staff").delete().eq("id", s.id);
        if (error) throw new Error(error.message);
      }
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function resetPassword(s: Staff) {
    if (!s.user_id) return toast.error("This staff has no login account");
    const pw = prompt("New password (min 8 characters):");
    if (!pw) return;
    try {
      await resetFn({ data: { user_id: s.user_id, password: pw } });
      toast.success("Password reset");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const filtered = items.filter((s) => {
    const matchQ = [s.name, s.email, s.phone].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
    const matchS = statusFilter === "all" || s.status === statusFilter;
    return matchQ && matchS;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Staff</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Staff</DialogTitle></DialogHeader>
              <form onSubmit={save} className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={120} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} /></div>
                {!editing && (
                  <div className="col-span-2"><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} maxLength={72} placeholder="Min 8 characters" /></div>
                )}
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "admin" | "staff" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Salary (₹/mo)</Label><Input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} required /></div>
                <div><Label>Join Date</Label><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} required /></div>
                <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} /></div>
                <Button type="submit" className="col-span-2 w-full" disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Create Account"}</Button>
              </form>
              <p className="text-xs text-muted-foreground">
                Creating a staff member here also creates their login account with a hashed password.
              </p>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Email</TableHead>
            <TableHead>Phone</TableHead><TableHead>Salary</TableHead><TableHead>Join</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No staff</TableCell></TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell><Badge variant={s.role === "admin" ? "default" : "secondary"}>{s.role}</Badge></TableCell>
                <TableCell>{s.email}</TableCell>
                <TableCell>{s.phone}</TableCell>
                <TableCell>₹{Number(s.salary).toLocaleString("en-IN")}</TableCell>
                <TableCell>{s.join_date}</TableCell>
                <TableCell><Badge variant={s.status === "active" ? "default" : "outline"}>{s.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {isAdmin && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>}
                  {isAdmin && s.user_id && <Button size="sm" variant="ghost" onClick={() => resetPassword(s)} title="Reset password">🔑</Button>}
                  {isAdmin && <Button size="sm" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* --------------------------- ATTENDANCE TAB --------------------------- */
function AttendanceTab({ isAdmin }: { isAdmin: boolean }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [todayRows, setTodayRows] = useState<Record<string, Attendance>>({});
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [history, setHistory] = useState<Attendance[]>([]);

  async function loadStaff() {
    const { data } = await supabase.from("staff").select("*").eq("status", "active").order("name");
    setStaff((data ?? []) as Staff[]);
    if (!selectedStaff && data && data.length) setSelectedStaff(data[0].id);
  }
  async function loadDay() {
    const { data } = await supabase.from("attendance").select("*").eq("attendance_date", date);
    const map: Record<string, Attendance> = {};
    (data ?? []).forEach((r: any) => { map[r.staff_id] = r as Attendance; });
    setTodayRows(map);
  }
  async function loadHistory() {
    if (!selectedStaff) return;
    const { data } = await supabase.from("attendance").select("*").eq("staff_id", selectedStaff).order("attendance_date", { ascending: false }).limit(60);
    setHistory((data ?? []) as Attendance[]);
  }

  useEffect(() => { loadStaff(); }, []);
  useEffect(() => { loadDay(); }, [date]);
  useEffect(() => { loadHistory(); }, [selectedStaff]);

  async function mark(staff_id: string, status: "present" | "absent" | "leave") {
    if (!isAdmin) return toast.error("Admin only");
    const { error } = await supabase.rpc("mark_attendance", { _staff_id: staff_id, _date: date, _status: status });
    if (error) return toast.error(error.message);
    toast.success("Marked " + status);
    loadDay();
    if (staff_id === selectedStaff) loadHistory();
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="font-semibold text-lg">Daily Attendance</h2>
            <p className="text-sm text-muted-foreground">Mark present, absent or leave for each active staff.</p>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
        </div>

        <Table>
          <TableHeader><TableRow>
            <TableHead>Staff</TableHead><TableHead>Current</TableHead><TableHead className="text-right">Mark</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No active staff</TableCell></TableRow>
            ) : staff.map((s) => {
              const cur = todayRows[s.id]?.status;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    {cur ? (
                      <Badge variant={cur === "present" ? "default" : cur === "leave" ? "secondary" : "destructive"}>{cur}</Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant={cur === "present" ? "default" : "outline"} disabled={!isAdmin} onClick={() => mark(s.id, "present")}>Present</Button>
                    <Button size="sm" variant={cur === "leave" ? "secondary" : "outline"} disabled={!isAdmin} onClick={() => mark(s.id, "leave")}>Leave</Button>
                    <Button size="sm" variant={cur === "absent" ? "destructive" : "outline"} disabled={!isAdmin} onClick={() => mark(s.id, "absent")}>Absent</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="font-semibold text-lg">Attendance History</h2>
            <p className="text-sm text-muted-foreground">Last 60 records for the selected staff.</p>
          </div>
          <div>
            <Label>Staff</Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No history</TableCell></TableRow>
            ) : history.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.attendance_date}</TableCell>
                <TableCell><Badge variant={h.status === "present" ? "default" : h.status === "leave" ? "secondary" : "destructive"}>{h.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{h.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* --------------------------- PAYROLL TAB --------------------------- */
function PayrollTab({ isAdmin }: { isAdmin: boolean }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [records, setRecords] = useState<SalaryRec[]>([]);
  const [payslip, setPayslip] = useState<{ staff: Staff; rec: SalaryRec } | null>(null);

  async function loadAll() {
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("salary_records").select("*").eq("month", month + "-01"),
    ]);
    setStaff((s ?? []) as Staff[]);
    setRecords((r ?? []) as SalaryRec[]);
  }
  useEffect(() => { loadAll(); }, [month]);

  const recByStaff = useMemo(() => {
    const m: Record<string, SalaryRec> = {};
    records.forEach((r) => { m[r.staff_id] = r; });
    return m;
  }, [records]);

  async function compute(staff_id: string, mark_paid: boolean) {
    if (!isAdmin) return toast.error("Admin only");
    const { error } = await supabase.rpc("compute_salary", { _staff_id: staff_id, _month: month + "-01", _mark_paid: mark_paid });
    if (error) return toast.error(error.message);
    toast.success(mark_paid ? "Computed & marked paid" : "Computed");
    loadAll();
  }

  function openPayslip(s: Staff) {
    const rec = recByStaff[s.id];
    if (!rec) return toast.error("Compute salary first");
    setPayslip({ staff: s, rec });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h2 className="font-semibold text-lg">Monthly Payroll</h2>
            <p className="text-sm text-muted-foreground">Salary = base × (present + leave) / total days in month. Absences are deducted.</p>
          </div>
          <div>
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
        </div>

        <Table>
          <TableHeader><TableRow>
            <TableHead>Staff</TableHead><TableHead>Base</TableHead>
            <TableHead>P / A / L</TableHead><TableHead>Salary Paid</TableHead>
            <TableHead>Paid On</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff</TableCell></TableRow>
            ) : staff.map((s) => {
              const r = recByStaff[s.id];
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>₹{Number(s.salary).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{r ? `${r.present_days} / ${r.absent_days} / ${r.leave_days}` : "—"}</TableCell>
                  <TableCell>{r ? `₹${Number(r.salary_paid).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell>{r?.paid_on ?? "—"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {isAdmin && <Button size="sm" variant="outline" onClick={() => compute(s.id, false)}><Calculator className="h-4 w-4 mr-1" />Compute</Button>}
                    {isAdmin && <Button size="sm" onClick={() => compute(s.id, true)}>Mark Paid</Button>}
                    <Button size="sm" variant="ghost" onClick={() => openPayslip(s)}><Printer className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!payslip} onOpenChange={(o) => !o && setPayslip(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payslip</DialogTitle></DialogHeader>
          {payslip && (
            <div id="payslip-print" className="space-y-3 text-sm">
              <div className="text-center border-b pb-3">
                <div className="text-xl font-bold">Santhosh Mobiles</div>
                <div className="text-muted-foreground">Salary Slip — {payslip.rec.month.slice(0, 7)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Name:</span> <b>{payslip.staff.name}</b></div>
                <div><span className="text-muted-foreground">Role:</span> {payslip.staff.role}</div>
                <div><span className="text-muted-foreground">Email:</span> {payslip.staff.email}</div>
                <div><span className="text-muted-foreground">Phone:</span> {payslip.staff.phone ?? "—"}</div>
              </div>
              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between"><span>Base Salary</span><b>₹{Number(payslip.rec.base_salary).toLocaleString("en-IN")}</b></div>
                <div className="flex justify-between"><span>Total Days</span><span>{payslip.rec.total_days}</span></div>
                <div className="flex justify-between"><span>Present</span><span>{payslip.rec.present_days}</span></div>
                <div className="flex justify-between"><span>Leave</span><span>{payslip.rec.leave_days}</span></div>
                <div className="flex justify-between"><span>Absent</span><span>{payslip.rec.absent_days}</span></div>
                <div className="flex justify-between border-t pt-2 text-base"><span><b>Net Paid</b></span><b>₹{Number(payslip.rec.salary_paid).toLocaleString("en-IN")}</b></div>
                <div className="flex justify-between text-muted-foreground"><span>Paid On</span><span>{payslip.rec.paid_on ?? "Pending"}</span></div>
              </div>
            </div>
          )}
          <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}