import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { haversineMeters } from "./geo";

const TOKEN_TTL_SECONDS = 20;

async function sha256(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(): string | null {
  const request = getRequest();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
}

async function assertPermission(
  context: { supabase: any; userId: string },
  perm: string,
  message: string,
) {
  const { data, error } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _perm: perm,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error(message);
}

/** Rotating single-use QR token for the counter tablet. */
export const issueQrToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(
      context,
      "can_access_qr_display",
      "Forbidden: you cannot open the QR counter display.",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

    const { error } = await supabaseAdmin.from("qr_sessions").insert({
      session_id: sessionId,
      token_hash: await sha256(rawToken),
      created_by: context.userId,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("qr_sessions")
      .delete()
      .lt("expires_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

    return {
      payload: JSON.stringify({
        session_id: sessionId,
        timestamp: Date.now(),
        token_hash: rawToken,
      }),
      expires_at: expiresAt.toISOString(),
    };
  });

/** Anti-spoofing validation flow for a staff scan. */
export const submitScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        qr_token: z.string().min(10).max(200),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        event_type: z.enum(["CHECK_IN", "CHECK_OUT"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, is_active, role")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile || !profile.is_active) throw new Error("Your account is not active.");

    // 1. Token must exist, be unexpired and unconsumed. Consume it atomically.
    const hash = await sha256(data.qr_token);
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("qr_sessions")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (!session) throw new Error("Invalid QR code.");
    if (session.consumed_at) throw new Error("This QR code has already been used.");
    if (new Date(session.expires_at).getTime() < Date.now())
      throw new Error("This QR code has expired. Please rescan the counter display.");

    // Auto-toggle event type: if last log was CHECK_IN, next is CHECK_OUT (and vice versa)
    const { data: lastLog, error: lastLogError } = await supabaseAdmin
      .from("attendance_logs")
      .select("event_type, status")
      .eq("user_id", context.userId)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastLogError) throw new Error(lastLogError.message);

    const toggledEventType = lastLog?.event_type === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN";
    const finalEventType = data.event_type || toggledEventType;

    const { data: consumed, error: consumeError } = await supabaseAdmin
      .from("qr_sessions")
      .update({ consumed_at: new Date().toISOString(), consumed_by: context.userId })
      .eq("id", session.id)
      .is("consumed_at", null)
      .select("id");
    if (consumeError) throw new Error(consumeError.message);
    if (!consumed || consumed.length === 0) throw new Error("This QR code has already been used.");

    // 2. Geofence + network checks.
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("cafe_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    const distance = settings
      ? haversineMeters(data.latitude, data.longitude, settings.latitude, settings.longitude)
      : null;
    const geoOk =
      !settings || !settings.enforce_geofence
        ? true
        : distance !== null && distance <= settings.radius_meters;

    const ip = clientIp();
    const ipMatch = settings?.gateway_ip ? ip === settings.gateway_ip : false;

    if (settings?.enforce_geofence && !geoOk) {
      await supabaseAdmin.from("attendance_logs").insert({
        user_id: context.userId,
        event_type: finalEventType,
        status: "REJECTED",
        latitude: data.latitude,
        longitude: data.longitude,
        distance_meters: distance,
        ip_address: ip,
        ip_match: ipMatch,
        geo_ok: false,
        qr_session_id: session.id,
        review_note: "Auto-rejected: outside the cafe geofence.",
      });
      throw new Error(
        `You are ${Math.round(distance ?? 0)}m from the cafe — outside the allowed ${settings.radius_meters}m radius.`,
      );
    }

    if (settings?.enforce_ip && settings.gateway_ip && !ipMatch) {
      await supabaseAdmin.from("attendance_logs").insert({
        user_id: context.userId,
        event_type: finalEventType,
        status: "REJECTED",
        latitude: data.latitude,
        longitude: data.longitude,
        distance_meters: distance,
        ip_address: ip,
        ip_match: false,
        geo_ok: geoOk,
        qr_session_id: session.id,
        review_note: "Auto-rejected: not on the cafe network.",
      });
      throw new Error("You must be connected to the cafe network to scan.");
    }

    const { data: log, error } = await supabaseAdmin
      .from("attendance_logs")
      .insert({
        user_id: context.userId,
        event_type: finalEventType,
        status: "PENDING",
        latitude: data.latitude,
        longitude: data.longitude,
        distance_meters: distance,
        ip_address: ip,
        ip_match: ipMatch,
        geo_ok: geoOk,
        qr_session_id: session.id,
      })
      .select("id, scanned_at")
      .single();
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      id: log.id,
      event_type: finalEventType,
      distance_meters: distance,
      ip_match: ipMatch,
    };
  });

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).default("ALL"),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(1).max(500).default(200),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _perm: "can_approve_attendance",
    });
    const { data: reports } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _perm: "can_view_reports",
    });
    if (!allowed && !reports) throw new Error("Forbidden: you cannot view attendance records.");

    let query = context.supabase
      .from("attendance_logs")
      .select("*")
      .order("scanned_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "ALL") query = query.eq("status", data.status);
    if (data.from) query = query.gte("scanned_at", data.from);
    if (data.to) query = query.lte("scanned_at", data.to);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];

    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: people } = await context.supabase
      .from("profiles")
      .select("id, full_name, username, role")
      .in("id", ids);
    const byId = new Map((people ?? []).map((p) => [p.id, p]));

    return rows.map((row) => {
      const person = byId.get(row.user_id) ?? null;
      return {
        ...row,
        profiles: person
          ? { full_name: person.full_name, username: person.username, role: person.role as string }
          : null,
      };
    });
  });

/** Approve or reject a pending scan. */
export const reviewAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["APPROVED", "REJECTED"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(
      context,
      "can_approve_attendance",
      "Forbidden: you cannot approve attendance.",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("attendance_logs")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
      })
      .eq("id", data.id)
      .eq("status", "PENDING")
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("This request was already reviewed.");
    return { ok: true as const };
  });

export const getCafeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context, "can_manage_staff", "Forbidden: cafe settings are owner-only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("cafe_settings").select("*").eq("id", true).single();
    return data;
  });

export const updateCafeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(100),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radius_meters: z.number().min(5).max(5000),
        gateway_ip: z.string().trim().max(64).nullable(),
        enforce_ip: z.boolean(),
        enforce_geofence: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context, "can_manage_staff", "Forbidden: cafe settings are owner-only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cafe_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
