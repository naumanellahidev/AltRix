// EDUVERSE Admin — create/update school + create first Principal with email+password
// Platform Super Admin only.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateSchoolRequest = {
  slug: string;
  name: string;
  isActive?: boolean;
  principalEmail: string;
  principalPassword: string;
  principalDisplayName?: string;
  // Optional owner assignment (Phase 5):
  //  - ownerUserId: pick an existing user as owner
  //  - OR ownerEmail (+ ownerPassword/ownerDisplayName for new account creation)
  ownerUserId?: string | null;
  ownerEmail?: string | null;
  ownerPassword?: string | null;
  ownerDisplayName?: string | null;
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

    const body = (await req.json()) as CreateSchoolRequest;
    const slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) return json({ ok: false, error: "Invalid slug" }, 400, traceId);
    const name = (body.name || slug).trim();
    if (!name) return json({ ok: false, error: "Invalid name" }, 400, traceId);

    const principalEmail = body.principalEmail.trim().toLowerCase();
    if (!principalEmail.includes("@")) return json({ ok: false, error: "Invalid principalEmail" }, 400, traceId);
    if (!body.principalPassword || body.principalPassword.length < 8) {
      return json({ ok: false, error: "Principal password must be at least 8 characters." }, 400, traceId);
    }

    const admin = createClient(supabaseUrl, serviceRole);

    const { data: psa, error: psaErr } = await admin
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (psaErr) return json({ ok: false, error: psaErr.message }, 400, traceId);
    if (!psa?.user_id) return json({ ok: false, error: "Forbidden" }, 403, traceId);

    // Upsert school
    const { data: school, error: schoolErr } = await admin
      .from("schools")
      .upsert(
        { slug, name, is_active: body.isActive ?? true },
        { onConflict: "slug" },
      )
      .select("id,slug,name,is_active")
      .single();
    if (schoolErr) return json({ ok: false, error: schoolErr.message }, 400, traceId);

    // Ensure default related rows
    await admin.from("school_branding").upsert({ school_id: school.id }, { onConflict: "school_id" });

    // Create or update principal
    const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) console.log("listUsers err:", listErr.message);
    const existingUser = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === principalEmail);

    let principalUserId = existingUser?.id ?? null;
    if (!principalUserId) {
      const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
        email: principalEmail,
        password: body.principalPassword,
        email_confirm: true,
      });
      if (createErr) return json({ ok: false, error: createErr.message }, 400, traceId);
      principalUserId = createdUser.user?.id ?? null;
    } else {
      const { error: updErr } = await admin.auth.admin.updateUserById(principalUserId, { password: body.principalPassword });
      if (updErr) return json({ ok: false, error: updErr.message }, 400, traceId);
    }
    if (!principalUserId) return json({ ok: false, error: "Failed to create principal user" }, 500, traceId);

    const displayName = body.principalDisplayName?.trim() || "Principal";

    await admin.from("profiles").upsert(
      { user_id: principalUserId, display_name: displayName },
      { onConflict: "user_id" },
    );

    const { error: memErr } = await admin
      .from("school_memberships")
      .upsert({ school_id: school.id, user_id: principalUserId, status: "active", created_by: actorUserId }, { onConflict: "school_id,user_id" });
    if (memErr) return json({ ok: false, error: memErr.message }, 400, traceId);

    // Principal role
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert(
        { school_id: school.id, user_id: principalUserId, role: "principal", created_by: actorUserId },
        { onConflict: "school_id,user_id,role" },
      );
    if (roleErr) return json({ ok: false, error: roleErr.message }, 400, traceId);

    await admin.from("school_user_directory").upsert(
      { school_id: school.id, user_id: principalUserId, email: principalEmail, display_name: displayName },
      { onConflict: "school_id,user_id" },
    );

    // ---- Phase 5: optional School Owner assignment ----
    let ownerUserId: string | null = null;
    let ownerEmailResolved: string | null = null;
    let ownerAssignmentExisted = false;
    try {
      if (body.ownerUserId) {
        ownerUserId = body.ownerUserId;
        const { data: ouser, error: ouserErr } = await admin.auth.admin.getUserById(ownerUserId);
        if (ouserErr || !ouser?.user) {
          return json(
            { ok: false, error: `Selected owner user does not exist (id=${ownerUserId}).` },
            404,
            traceId,
          );
        }
        ownerEmailResolved = ouser.user.email?.toLowerCase() ?? null;
      } else if (body.ownerEmail) {
        const ownerEmail = body.ownerEmail.trim().toLowerCase();
        if (!ownerEmail.includes("@")) {
          return json({ ok: false, error: "Invalid ownerEmail format." }, 400, traceId);
        }
        const existingOwner = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === ownerEmail);
        if (existingOwner) {
          ownerUserId = existingOwner.id;
        } else {
          // Explicit "not found" path. If caller didn't provide a password we treat this as a
          // lookup failure rather than silently creating a brand-new account.
          if (!body.ownerPassword) {
            return json(
              {
                ok: false,
                code: "owner_email_not_found",
                error: `No existing user found for ${ownerEmail}. Provide ownerPassword to create a new owner account, or pick from the existing owners list.`,
              },
              404,
              traceId,
            );
          }
          if (body.ownerPassword.length < 8) {
            return json({ ok: false, error: "Owner password must be at least 8 characters (new owner)." }, 400, traceId);
          }
          const { data: createdOwner, error: ownerCreateErr } = await admin.auth.admin.createUser({
            email: ownerEmail,
            password: body.ownerPassword,
            email_confirm: true,
          });
          if (ownerCreateErr) return json({ ok: false, error: ownerCreateErr.message }, 400, traceId);
          ownerUserId = createdOwner.user?.id ?? null;
        }
        ownerEmailResolved = ownerEmail;
      }

      if (ownerUserId) {
        // Backend validation: do not create a duplicate assignment row for the same
        // (school_id, owner_user_id). Unique constraint backs this up at the DB level.
        const { data: existingAssignment } = await admin
          .from("school_owner_assignments")
          .select("id")
          .eq("school_id", school.id)
          .eq("owner_user_id", ownerUserId)
          .maybeSingle();
        ownerAssignmentExisted = !!existingAssignment?.id;

        const ownerDisplay = body.ownerDisplayName?.trim() || "School Owner";
        await admin.from("profiles").upsert(
          { user_id: ownerUserId, display_name: ownerDisplay },
          { onConflict: "user_id" },
        );
        await admin.from("school_memberships").upsert(
          { school_id: school.id, user_id: ownerUserId, status: "active", created_by: actorUserId },
          { onConflict: "school_id,user_id" },
        );
        await admin.from("user_roles").upsert(
          { school_id: school.id, user_id: ownerUserId, role: "school_owner", created_by: actorUserId },
          { onConflict: "school_id,user_id,role" },
        );

        if (!ownerAssignmentExisted) {
          const { error: soaErr } = await admin.from("school_owner_assignments").insert({
            school_id: school.id,
            owner_user_id: ownerUserId,
            created_by: actorUserId,
          });
          // 23505 = unique_violation — handle the race where another request inserted between
          // our pre-check and our insert.
          if (soaErr && (soaErr as { code?: string }).code !== "23505") {
            return json({ ok: false, error: `Owner assignment failed: ${soaErr.message}` }, 400, traceId);
          }
          if (soaErr) ownerAssignmentExisted = true;
        }

        if (ownerEmailResolved) {
          await admin.from("school_user_directory").upsert(
            { school_id: school.id, user_id: ownerUserId, email: ownerEmailResolved, display_name: ownerDisplay },
            { onConflict: "school_id,user_id" },
          );
        }
      }
    } catch (ownerErr) {
      console.error("owner assignment error:", ownerErr);
      const err = ownerErr as { message?: string };
      return json({ ok: false, error: `Owner assignment failed: ${err?.message ?? "unknown"}` }, 400, traceId);
    }

    // Mark as bootstrapped (so bootstrap secret isn't required later)
    await admin
      .from("school_bootstrap")
      .upsert(
        {
          school_id: school.id,
          locked: true,
          bootstrapped_at: new Date().toISOString(),
          bootstrapped_by: actorUserId,
        },
        { onConflict: "school_id" },
      );

    await admin.from("audit_logs").insert({
      school_id: school.id,
      actor_user_id: actorUserId,
      action: "school_created_direct",
      entity_type: "school",
      entity_id: slug,
      metadata: {
        principalEmail,
        ownerUserId,
        ownerEmail: ownerEmailResolved,
        ownerAssignmentExisted,
      },
    });

    return json(
      { ok: true, school, principalUserId, ownerUserId, ownerAssignmentExisted },
      200,
      traceId,
    );
  } catch (e) {
    console.error("eduverse-admin-create-school error:", e);
    const err = e as { message?: string };
    return json({ ok: false, error: err?.message ?? "Unknown error" }, 500, makeTraceId());
  }
});
