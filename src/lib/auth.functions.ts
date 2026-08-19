import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const bootstrapSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

const createUserSchema = bootstrapSchema.extend({
  role: z.enum(["MANAGER", "ADMIN", "STAFF"]),
  can_approve_attendance: z.boolean().default(false),
  can_view_reports: z.boolean().default(false),
  can_manage_staff: z.boolean().default(false),
  can_access_qr_display: z.boolean().default(false),
});

/** Public: is the system still in boot state (zero users)? */
export const getBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return { needsBootstrap: (count ?? 0) === 0 };
});

/** POST /api/auth/bootstrap-owner — usable exactly once, while zero users exist. */
export const bootstrapOwner = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => bootstrapSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) throw new Error("Signup is locked: this system already has an owner.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, username: data.username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create owner");

    const userId = created.user.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name: data.full_name,
      username: data.username.toLowerCase(),
      email: data.email,
      role: "OWNER",
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }
    await supabaseAdmin.from("user_permissions").insert({
      user_id: userId,
      can_approve_attendance: true,
      can_view_reports: true,
      can_manage_staff: true,
      can_access_qr_display: true,
    });
    return { ok: true as const };
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: permissions } = await context.supabase
      .from("user_permissions")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { profile, permissions };
  });

async function assertCanManageStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _perm: "can_manage_staff",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: you cannot manage staff accounts.");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCanManageStaff(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: perms } = await context.supabase.from("user_permissions").select("*");
    const byUser = new Map((perms ?? []).map((p) => [p.user_id, p]));
    return (data ?? []).map((profile) => ({
      ...profile,
      user_permissions: byUser.get(profile.id) ?? null,
    }));
  });

/** POST /api/users/create — owner/manager creating staff, admin or manager accounts. */
export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertCanManageStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, username: data.username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create account");
    const userId = created.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name: data.full_name,
      username: data.username.toLowerCase(),
      email: data.email,
      role: data.role,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }
    await supabaseAdmin.from("user_permissions").insert({
      user_id: userId,
      can_approve_attendance: data.can_approve_attendance,
      can_view_reports: data.can_view_reports,
      can_manage_staff: data.can_manage_staff,
      can_access_qr_display: data.can_access_qr_display,
    });
    return { ok: true as const, id: userId };
  });

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["MANAGER", "ADMIN", "STAFF"]).optional(),
        is_active: z.boolean().optional(),
        permissions: z
          .object({
            can_approve_attendance: z.boolean(),
            can_view_reports: z.boolean(),
            can_manage_staff: z.boolean(),
            can_access_qr_display: z.boolean(),
          })
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!target) throw new Error("User not found");
    if (target.role === "OWNER") throw new Error("The owner account cannot be modified.");

    if (data.role || data.is_active !== undefined) {
      const patch: { role?: "MANAGER" | "ADMIN" | "STAFF"; is_active?: boolean } = {};
      if (data.role) patch.role = data.role;
      if (data.is_active !== undefined) patch.is_active = data.is_active;
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }
    if (data.permissions) {
      const { error } = await supabaseAdmin
        .from("user_permissions")
        .upsert({ user_id: data.user_id, ...data.permissions });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(128) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!target) throw new Error("User not found");
    if (target.role === "OWNER") throw new Error("The owner password cannot be reset here.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
