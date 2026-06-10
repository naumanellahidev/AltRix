// EDUVERSE Admin — create user with explicit password (no public signup)
// Platform Super Admin only.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateUserRequest = {
  schoolSlug: string;
  email: string;
  password: string;
  displayName?: string;
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

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401, traceId);
    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const actorUserId = claimsData?.claims?.sub;
    if (claimsErr || !actorUserId) return json({ ok: false, error: "Unauthorized" }, 401, traceId);

    const body = (await req.json()) as CreateUserRequest;
    const schoolSlug = body.schoolSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!schoolSlug) return json({ ok: false, error: "Invalid schoolSlug" }, 400, traceId);

    const email = body.email.trim().toLowerCase();
    if (!email.includes("@")) return json({ ok: false, error: "Invalid email" }, 400, traceId);

    const password = body.password;
    if (!password || password.length < 8) return json({ ok: false, error: "Password must be at least 8 characters." }, 400, traceId);

    // Guardrail: never create platform super admin via this function.
    if ((body.role as string) === "super_admin") return json({ ok: false, error: "Invalid role" }, 400, traceId);

    const admin = createClient(supabaseUrl, serviceRole);

    // Resolve school first (needed for both permission check and downstream writes)
    const { data: school, error: schoolErr } = await admin
      .from("schools")
      .select("id,slug,name")
      .eq("slug", schoolSlug)
      .maybeSingle();
    if (schoolErr) {
      console.error("[create-user] school lookup failed", schoolErr);
      return json({ ok: false, step: "school_lookup", error: schoolErr.message }, 200, traceId);
    }
    if (!school) return json({ ok: false, step: "school_lookup", error: `School not found: ${schoolSlug}` }, 200, traceId);

    // Permission: platform super admin OR governance role in this school OR school_owner_assignments
    const { data: psa, error: psaErr } = await admin
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (psaErr) {
      console.error("[create-user] psa lookup failed", psaErr);
      return json({ ok: false, step: "permission_lookup", error: psaErr.message }, 200, traceId);
    }
    const isPlatformSuperAdmin = !!psa?.user_id;

    let actorRoles: string[] = [];
    if (!isPlatformSuperAdmin) {
      const { data: roleRows, error: roleErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("school_id", school.id)
        .eq("user_id", actorUserId);
      if (roleErr) {
        console.error("[create-user] role lookup failed", roleErr);
        return json({ ok: false, step: "permission_lookup", error: roleErr.message }, 200, traceId);
      }
      actorRoles = (roleRows ?? []).map((r: any) => String(r.role));

      const { data: ownerAssign } = await admin
        .from("school_owner_assignments")
        .select("id")
        .eq("school_id", school.id)
        .eq("owner_user_id", actorUserId)
        .maybeSingle();
      const isAssignedOwner = !!ownerAssign?.id;

      const allowed = ["super_admin", "school_owner", "principal", "vice_principal", "hr_manager"];
      const hasAllowed = actorRoles.some((r) => allowed.includes(r));
      if (!hasAllowed && !isAssignedOwner) {
        return json(
          {
            ok: false,
            step: "permission_check",
            error: `You do not have permission to create staff in this school. Required role: super_admin, school_owner, principal, vice_principal, or hr_manager. Your roles: ${actorRoles.join(", ") || "(none)"}.`,
          },
          200,
          traceId,
        );
      }

      // Non-platform admins cannot create school_owner roles
      if (body.role === "school_owner" && !actorRoles.includes("school_owner")) {
        return json({ ok: false, step: "permission_check", error: "Only platform super admins or existing school owners can assign the school_owner role." }, 200, traceId);
      }
    }

    // Create or update auth user
    let userId: string | null = null;
    try {
      const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (listErr) console.error("[create-user] listUsers warn:", listErr.message);
      const existingUser = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      userId = existingUser?.id ?? null;

      if (!userId) {
        const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createErr) {
          console.error("[create-user] auth.createUser failed", createErr);
          const msg = createErr.message || "Failed to create user";
          const friendly = /pwned|leaked|breach|weak/i.test(msg)
            ? "This password is too weak or has been found in a known data breach. Please choose a stronger password."
            : msg;
          return json({ ok: false, step: "auth_create_user", error: friendly }, 200, traceId);
        }
        userId = createdUser.user?.id ?? null;
      } else {
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
        if (updErr) {
          console.error("[create-user] auth.updateUserById failed", updErr);
          const msg = updErr.message || "Failed to update password";
          const friendly = /pwned|leaked|breach|weak/i.test(msg)
            ? "This password is too weak or has been found in a known data breach. Please choose a stronger password."
            : msg;
          return json({ ok: false, step: "auth_update_password", error: friendly }, 200, traceId);
        }
      }
    } catch (e) {
      const err = e as { message?: string };
      console.error("[create-user] auth step exception", e);
      return json({ ok: false, step: "auth_user", error: err?.message ?? "Auth step failed" }, 200, traceId);
    }
    if (!userId) return json({ ok: false, step: "auth_user", error: "Failed to resolve user id" }, 200, traceId);

    // Profile (profiles.id == auth user id)
    if (body.displayName?.trim()) {
      const { error: profErr } = await admin
        .from("profiles")
        .upsert({ id: userId, display_name: body.displayName.trim() }, { onConflict: "id" });
      if (profErr) {
        console.error("[create-user] profiles upsert failed", profErr);
        return json({ ok: false, step: "profiles_upsert", error: profErr.message }, 200, traceId);
      }
    }

    // Membership
    const { error: memErr } = await admin
      .from("school_memberships")
      .upsert({ school_id: school.id, user_id: userId, status: "active", created_by: actorUserId }, { onConflict: "school_id,user_id" });
    if (memErr) {
      console.error("[create-user] school_memberships upsert failed", memErr);
      return json({ ok: false, step: "school_memberships_upsert", error: memErr.message }, 200, traceId);
    }

    // Role
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert(
        { school_id: school.id, user_id: userId, role: body.role, created_by: actorUserId },
        { onConflict: "school_id,user_id,role" },
      );
    if (roleErr) {
      console.error("[create-user] user_roles upsert failed", roleErr);
      return json({ ok: false, step: "user_roles_upsert", error: roleErr.message }, 200, traceId);
    }

    await admin.from("audit_logs").insert({
      school_id: school.id,
      actor_user_id: actorUserId,
      action: "user_created_direct",
      entity_type: "user",
      entity_id: userId,
      metadata: { email, role: body.role, actor_is_platform_admin: isPlatformSuperAdmin, actor_roles: actorRoles },
    });

    return json({ ok: true, school, userId }, 200, traceId);
  } catch (e) {
    console.error("eduverse-admin-create-user error:", e);
    const err = e as { message?: string };
    return json({ ok: false, step: "unhandled", error: err?.message ?? "Unknown error" }, 500, makeTraceId());
  }
});
