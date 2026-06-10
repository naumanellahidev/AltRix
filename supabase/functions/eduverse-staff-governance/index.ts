// EDUVERSE Staff Governance
// Deactivate/reactivate (via role removal/reassignment), and generate recovery/magic links.
// Requires JWT (verify_jwt=true); also checks caller has staff governance privileges.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type GovernanceAction =
  | "deactivate" // remove all roles for user in a school
  | "set_roles" // replace roles for user in a school
  | "set_password"
  | "set_email"; // update auth email for user

type GovernanceRequest = {
  schoolSlug: string;
  targetUserId: string;
  roles?: string[]; // required for set_roles
  password?: string; // required for set_password
  email?: string; // required for set_email
  reason?: string;
};

const makeTraceId = () => crypto.randomUUID();

const json = (data: unknown, status = 200, traceId?: string) =>
  new Response(JSON.stringify({ traceId, ...((data ?? {}) as any) }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const normalizeSlug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const traceId = makeTraceId();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!anon) return json({ ok: false, error: "Missing SUPABASE_ANON_KEY" }, 500, traceId);

    // user-scoped client: identify caller
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401, traceId);
    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const actorUserId = claimsData?.claims?.sub;
    if (claimsErr || !actorUserId) return json({ ok: false, error: "Unauthorized" }, 401, traceId);

    const body = (await req.json()) as GovernanceRequest & { action?: GovernanceAction };
    const action = (body.action ?? "").trim() as GovernanceAction;
    if (!action) return json({ ok: false, error: "Missing action" }, 400, traceId);

    const schoolSlug = normalizeSlug(body.schoolSlug ?? "");
    if (!schoolSlug) return json({ ok: false, error: "Invalid schoolSlug" }, 400, traceId);

    const targetUserId = (body.targetUserId ?? "").trim();
    if (!targetUserId) return json({ ok: false, error: "Invalid targetUserId" }, 400, traceId);

    const admin = createClient(supabaseUrl, serviceRole);

    // Resolve school
    const { data: school, error: schoolErr } = await admin
      .from("schools")
      .select("id,slug")
      .eq("slug", schoolSlug)
      .maybeSingle();
    if (schoolErr || !school) return json({ ok: false, error: schoolErr?.message ?? "School not found" }, 400, traceId);

    // Permission check: platform super admin OR one of the governance roles in the school
    const { data: psa, error: psaErr } = await admin
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (psaErr) return json({ ok: false, error: psaErr.message }, 400, traceId);
    const isPlatformSuperAdmin = !!psa?.user_id;

    let actorRoles: string[] = [];
    let isSchoolOwnerAssignment = false;
    if (!isPlatformSuperAdmin) {
      const { data: roleRows, error: roleErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("school_id", school.id)
        .eq("user_id", actorUserId);
      if (roleErr) {
        console.error("[governance] role lookup failed", roleErr);
        return json({ ok: false, step: "permission_lookup", error: roleErr.message }, 200, traceId);
      }
      actorRoles = (roleRows ?? []).map((r: any) => String(r.role));

      // Also check school_owner_assignments (multi-school owners)
      const { data: ownerAssign } = await admin
        .from("school_owner_assignments")
        .select("id")
        .eq("school_id", school.id)
        .eq("owner_user_id", actorUserId)
        .maybeSingle();
      isSchoolOwnerAssignment = !!ownerAssign?.id;

      const allowed = ["super_admin", "school_owner", "principal", "vice_principal", "hr_manager"];
      const hasAllowedRole = actorRoles.some((r) => allowed.includes(r));
      if (!hasAllowedRole && !isSchoolOwnerAssignment) {
        return json(
          {
            ok: false,
            step: "permission_check",
            error: `You do not have permission to manage staff in this school. Required role: super_admin, school_owner, principal, vice_principal, or hr_manager. Your roles: ${actorRoles.join(", ") || "(none)"}.`,
          },
          200,
          traceId,
        );
      }
    }

    // Snapshot existing roles for audit metadata
    const { data: beforeRolesRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("school_id", school.id)
      .eq("user_id", targetUserId);
    const beforeRoles = (beforeRolesRows ?? []).map((r: any) => String(r.role));

    if (action === "deactivate") {
      const { error: delErr } = await admin
        .from("user_roles")
        .delete()
        .eq("school_id", school.id)
        .eq("user_id", targetUserId);
      if (delErr) return json({ ok: false, error: delErr.message }, 400, traceId);

      await admin.from("audit_logs").insert({
        school_id: school.id,
        actor_user_id: actorUserId,
        action: "staff_deactivated",
        entity_type: "user",
        entity_id: targetUserId,
        metadata: { beforeRoles, reason: body.reason ?? null },
      });

      return json({ ok: true }, 200, traceId);
    }

    if (action === "set_roles") {
      const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
      if (roles.length === 0) return json({ ok: false, error: "roles is required" }, 400, traceId);

      // Replace roles: delete then insert
      const { error: delErr } = await admin
        .from("user_roles")
        .delete()
        .eq("school_id", school.id)
        .eq("user_id", targetUserId);
      if (delErr) return json({ ok: false, error: delErr.message }, 400, traceId);

      const rows = roles.map((role) => ({
        school_id: school.id,
        user_id: targetUserId,
        role,
        created_by: actorUserId,
      }));
      const { error: insErr } = await admin.from("user_roles").insert(rows);
      if (insErr) return json({ ok: false, error: insErr.message }, 400, traceId);

      await admin.from("audit_logs").insert({
        school_id: school.id,
        actor_user_id: actorUserId,
        action: "staff_roles_reassigned",
        entity_type: "user",
        entity_id: targetUserId,
        metadata: { beforeRoles, afterRoles: roles, reason: body.reason ?? null },
      });

      return json({ ok: true, roles }, 200, traceId);
    }

    if (action === "set_password") {
      const password = String(body.password ?? "");
      if (!password || password.length < 8) {
        return json({ ok: false, error: "Password must be at least 8 characters." }, 200, traceId);
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, { password });
      if (updErr) {
        const msg = updErr.message || "Failed to update password";
        const friendly = /pwned|leaked|breach|weak/i.test(msg)
          ? "This password is too weak or has been found in a known data breach. Please choose a stronger password."
          : msg;
        return json({ ok: false, error: friendly }, 200, traceId);
      }

      await admin.from("audit_logs").insert({
        school_id: school.id,
        actor_user_id: actorUserId,
        action: "staff_password_set_direct",
        entity_type: "user",
        entity_id: targetUserId,
        metadata: {
          reason: body.reason ?? null,
        },
      });

      return json({ ok: true }, 200, traceId);
    }

    if (action === "set_email") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email)) {
        return json({ ok: false, error: "Invalid email address." }, 200, traceId);
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
        email,
        email_confirm: true,
      });
      if (updErr) {
        const msg = updErr.message || "Failed to update email";
        const friendly = /already.*registered|duplicate|exists/i.test(msg)
          ? "Another account already uses this email."
          : msg;
        return json({ ok: false, error: friendly }, 200, traceId);
      }

      await admin.from("audit_logs").insert({
        school_id: school.id,
        actor_user_id: actorUserId,
        action: "staff_email_updated",
        entity_type: "user",
        entity_id: targetUserId,
        metadata: { email, reason: body.reason ?? null },
      });

      return json({ ok: true, email }, 200, traceId);
    }

    return json({ ok: false, error: "Unknown action" }, 400, traceId);
  } catch (e) {
    console.error("eduverse-staff-governance error:", e);
    const err = e as { message?: string };
    return json({ ok: false, error: err?.message ?? "Unknown error" }, 500, makeTraceId());
  }
});
