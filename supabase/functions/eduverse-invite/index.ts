// EDUVERSE Invite — admin creates users (no public signup)
// Requires JWT (verify_jwt=true); also checks caller has staff-management privileges.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InviteRequest = {
  schoolSlug: string;
  email: string;
  password: string;
  role:
    | "school_owner"
    | "principal"
    | "vice_principal"
    | "academic_coordinator"
    | "teacher"
    | "accountant"
    | "hr_manager"
    | "counselor"
    | "student"
    | "parent"
    | "marketing_staff";
  displayName?: string;
};

const makeTraceId = () => crypto.randomUUID();

const json = (data: unknown, status = 200, traceId?: string) =>
  new Response(JSON.stringify({ traceId, ...((data ?? {}) as any) }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const traceId = makeTraceId();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!anon) return json({ ok: false, error: "Missing SUPABASE_ANON_KEY" }, 500, traceId);

    // user-scoped client (to identify caller)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401, traceId);
    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const actorUserId = claimsData?.claims?.sub;
    if (claimsErr || !actorUserId) return json({ ok: false, error: "Unauthorized" }, 401, traceId);

    const body = (await req.json()) as InviteRequest;
    const schoolSlug = body.schoolSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!schoolSlug) return json({ ok: false, error: "Invalid schoolSlug" }, 400, traceId);

    // admin client
    const admin = createClient(supabaseUrl, serviceRole);

    // Resolve school
    const { data: school, error: schoolErr } = await admin
      .from("schools")
      .select("id,slug,name")
      .eq("slug", schoolSlug)
      .maybeSingle();
    if (schoolErr || !school) return json({ ok: false, error: schoolErr?.message ?? "School not found" }, 400, traceId);

    // Platform Super Admins can invite for ANY school
    const { data: psaRows, error: psaErr } = await admin
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", actorUserId)
      .limit(1);
    if (psaErr) return json({ ok: false, error: psaErr.message }, 400, traceId);
    const isPlatformSuperAdmin = !!(psaRows && psaRows.length > 0);

    if (!isPlatformSuperAdmin) {
      const { data: roleRow, error: roleCheckErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("school_id", school.id)
        .eq("user_id", actorUserId)
        .in("role", ["super_admin", "school_owner", "principal", "vice_principal"])
        .limit(1);
      if (roleCheckErr) return json({ ok: false, error: roleCheckErr.message }, 400, traceId);
      if (!roleRow || roleRow.length === 0) return json({ ok: false, error: "Forbidden" }, 403, traceId);
    }

    const inviteEmail = body.email.trim().toLowerCase();
    if (!inviteEmail.includes("@")) return json({ ok: false, error: "Invalid email" }, 400, traceId);

    const password = String(body.password ?? "");
    if (!password || password.length < 8) {
      return json({ ok: false, error: "Password must be at least 8 characters." }, 400, traceId);
    }

    // Create user (idempotent-ish): if exists, reuse
    const { data: existing, error: findErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (findErr) console.log("listUsers err:", findErr.message);
    const existingUser = existing?.users?.find((u) => u.email?.toLowerCase() === inviteEmail);

    let userId = existingUser?.id ?? null;
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: inviteEmail,
        password,
        email_confirm: false,
      });
      if (createErr) return json({ ok: false, error: createErr.message }, 400, traceId);
      userId = created.user?.id ?? null;
    } else {
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
      if (updErr) return json({ ok: false, error: updErr.message }, 400, traceId);
    }

    if (!userId) return json({ ok: false, error: "Failed to create user" }, 500, traceId);

    if (body.displayName?.trim()) {
      const { error: profErr } = await admin
        .from("profiles")
        .upsert({ id: userId, display_name: body.displayName.trim() }, { onConflict: "id" });
      if (profErr) return json({ ok: false, error: profErr.message }, 400, traceId);
    }

    // Attach membership + role
    const { error: memErr } = await admin
      .from("school_memberships")
      .upsert({ school_id: school.id, user_id: userId, status: "active" }, { onConflict: "school_id,user_id" });
    if (memErr) return json({ ok: false, error: memErr.message }, 400, traceId);

    const { error: assignErr } = await admin
      .from("user_roles")
      .upsert({ school_id: school.id, user_id: userId, role: body.role }, { onConflict: "school_id,user_id,role" });
    if (assignErr) return json({ ok: false, error: assignErr.message }, 400, traceId);

    // Directory for UI
    await admin
      .from("school_user_directory")
      .upsert(
        {
          school_id: school.id,
          user_id: userId,
          email: inviteEmail,
          display_name: body.displayName ?? null,
        },
        { onConflict: "school_id,user_id" },
      );

    await admin.from("audit_logs").insert({
      school_id: school.id,
      actor_user_id: actorUserId,
      action: "user_created_direct",
      entity_type: "user",
      entity_id: userId,
      metadata: { email: inviteEmail, role: body.role },
    });

    return json(
      {
        ok: true,
        userId,
        message: "User created and password set.",
      },
      200,
      traceId,
    );
  } catch (e) {
    console.error("eduverse-invite error:", e);
    const err = e as { message?: string };
    return json({ ok: false, error: err?.message ?? "Unknown error" }, 500, crypto.randomUUID());
  }
});
