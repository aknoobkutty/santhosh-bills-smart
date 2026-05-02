import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
    if (!data) throw new Error("Admin only");
}

const createSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(20).optional().nullable(),
  salary: z.number().min(0).default(0),
  role: z.enum(["admin", "staff"]).default("staff"),
});

export const adminCreateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Create auth user (password is bcrypt-hashed by Supabase Auth)
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "Failed to create user");
    const newUserId = created.user.id;

    // Override role if needed (handle_new_user defaults non-admin emails to 'staff')
    if (data.role === "admin") {
      await supabaseAdmin.from("user_roles").upsert({ user_id: newUserId, role: "admin" }, { onConflict: "user_id,role" });
    }

    // Create staff row linked to the new user
    const { error: sErr } = await supabaseAdmin.from("staff").insert({
      user_id: newUserId,
      name: data.full_name,
      email: data.email,
      phone: data.phone ?? null,
      salary: data.salary,
      role: data.role,
      status: "active",
    });
    if (sErr) throw new Error(sErr.message);

    return { user_id: newUserId };
  });

export const adminDeleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("Cannot delete yourself");
    await supabaseAdmin.from("staff").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });