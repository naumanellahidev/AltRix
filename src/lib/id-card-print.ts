import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentForCard = {
  id: string;
  first_name: string;
  last_name: string | null;
  roll_number: string | null;
  registration_number: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  card_valid_until: string | null;
  profile_image_url: string | null;
  emergency_contact: string | null;
  class_name?: string;
  section_name?: string;
};

export type CardSettings = {
  id?: string;
  school_id: string;
  card_layout: string;      // vertical, horizontal
  primary_color: string;
  text_color: string;
  card_title: string;
  show_logo: boolean;
  show_qr_code: boolean;
  show_roll_number: boolean;
  show_class: boolean;
  show_dob: boolean;
  show_blood_group: boolean;
  show_emergency_contact: boolean;
  show_signature: boolean;
  signature_text: string;
  design_style: string;     // classic, modern, minimal, playful
};

export const DEFAULT_CARD_SETTINGS = (schoolId: string): CardSettings => ({
  school_id: schoolId,
  card_layout: "vertical",
  primary_color: "#ea580c", // default to a vibrant orange color to match the picture initially
  text_color: "#ffffff",
  card_title: "SCHOOL TAGLINE",
  show_logo: true,
  show_qr_code: true,
  show_roll_number: true,
  show_class: true,
  show_dob: true,
  show_blood_group: true,
  show_emergency_contact: true,
  show_signature: false,
  signature_text: "Authorized Signature",
  design_style: "modern",
});

/**
 * Fetch card settings and print card(s) for the given student(s).
 */
export async function printStudentCards(
  supabase: SupabaseClient,
  schoolId: string,
  students: StudentForCard[],
  schoolLogo: string | null,
  schoolName: string
) {
  if (students.length === 0) return;

  // 1. Fetch settings and school details
  const { data: settingsData } = await supabase
    .from("school_id_card_settings")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();

  const { data: schoolData } = await supabase
    .from("schools")
    .select("name, logo_url, address, phone, email")
    .eq("id", schoolId)
    .maybeSingle();

  const settings = settingsData ? (settingsData as CardSettings) : DEFAULT_CARD_SETTINGS(schoolId);

  const finalSchoolName = schoolData?.name || schoolName;
  const finalSchoolLogo = schoolData?.logo_url || schoolLogo;
  const schoolAddress = schoolData?.address || "";
  const schoolPhone = schoolData?.phone || "";
  const schoolEmail = schoolData?.email || "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Pop-up blocked! Please allow pop-ups to print ID cards.");
  }

  const layout = settings.card_layout || "vertical";
  const primaryColor = settings.primary_color || "#ea580c";
  const textColor = settings.text_color || "#ffffff";

  // Build print HTML content
  let cardsHtml = "";
  students.forEach(s => {
    const qrData = `student_id:${s.id || ""}\nname:${s.first_name} ${s.last_name || ""}\nroll:${s.roll_number || ""}\nclass:${s.class_name || ""}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
    
    // Logo block helper matching mockup style (tagline completely removed)
    const logoBlockHtml = settings.show_logo
      ? (finalSchoolLogo 
          ? `<img src="${finalSchoolLogo}" alt="Logo" class="school-logo-print" />` 
          : `<div class="logo-placeholder-box">
              <span class="logo-placeholder-text" style="color: ${primaryColor}">
                LOGO
              </span>
             </div>`)
      : "";

    const studentPhoto = s.profile_image_url 
      ? `<img src="${s.profile_image_url}" alt="Photo" class="student-photo-print" onerror="this.onerror=null; this.outerHTML='<div class=&quot;student-photo-print-placeholder&quot;>👤</div>';" />`
      : `<div class="student-photo-print-placeholder">👤</div>`;

    const dynamicEmail = `${s.first_name.toLowerCase()}${s.last_name ? `.${s.last_name.toLowerCase()}` : ""}@yourmail.com`;

    if (layout === "vertical") {
      cardsHtml += `
        <div class="card-pair-wrapper">
          <!-- FRONT SIDE -->
          <div class="card card-vertical card-front">
            <!-- Background Watermark & Crease -->
            <div class="card-bg-watermark">
              <svg width="100%" height="100%" viewBox="0 0 320 504" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M-30 140 C50 110, 100 200, 200 130 C300 60, 350 180, 400 130" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 170 C50 140, 100 230, 200 160 C300 95, 350 210, 400 160" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 200 C50 170, 100 260, 200 190 C300 125, 350 240, 400 190" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 230 C50 200, 100 290, 200 220 C300 155, 350 270, 400 220" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <!-- Crease divider in the middle -->
                <path d="M-10 240 C90 205, 230 275, 330 240 L330 255 C230 290, 90 220, -10 255 Z" fill="#ffffff" />
                <path d="M-10 240 C90 205, 230 275, 330 240" stroke="#e2e8f0" stroke-width="0.8"/>
                <path d="M-10 255 C90 220, 230 290, 330 255" stroke="#cbd5e1" stroke-width="0.8"/>
              </svg>
            </div>

            <!-- Top Left Wave -->
            <div class="top-left-wave-svg">
              <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
                <path d="M0 0 H115 C100 20, 85 45, 65 52 C45 60, 60 90, 45 108 C30 125, 20 110, 0 125 Z" fill="${primaryColor}" opacity="0.35"/>
                <path d="M0 0 H95 C80 15, 70 35, 55 40 C35 45, 50 75, 35 90 C20 105, 10 95, 0 108 Z" fill="${primaryColor}"/>
              </svg>
            </div>

            <div class="card-header-block">
              ${logoBlockHtml}
              <div class="school-name-text">${finalSchoolName}</div>
            </div>

            <div class="photo-frame-container">
              <div class="photo-frame">
                ${studentPhoto}
              </div>
            </div>

            <div class="student-info-block">
              <h2 class="student-name">${s.first_name} ${s.last_name || ""}</h2>
              <div class="student-role-badge" style="color: ${primaryColor}">STUDENT</div>

              <div class="fields-list">
                ${settings.show_roll_number ? `
                  <div class="field-item">
                    <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">ID:</span>
                    <span class="field-val" style="color: #475569; font-weight: 500;">${s.registration_number || s.roll_number || "—"}</span>
                  </div>
                ` : ""}

                ${settings.show_emergency_contact ? `
                  <div class="field-item">
                    <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">Phone:</span>
                    <span class="field-val" style="color: #475569; font-weight: 500;">${s.emergency_contact || "—"}</span>
                  </div>
                ` : ""}
                ${settings.show_class && (s.class_name || s.section_name) ? `
                  <div class="field-item">
                    <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">Class:</span>
                    <span class="field-val" style="color: #475569; font-weight: 500;">${s.class_name || ""} ${s.section_name ? `(${s.section_name})` : ""}</span>
                  </div>
                ` : ""}
                ${settings.show_dob && s.date_of_birth ? `
                  <div class="field-item">
                    <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">D.O.B:</span>
                    <span class="field-val" style="color: #475569; font-weight: 500;">${s.date_of_birth}</span>
                  </div>
                ` : ""}
                ${settings.show_blood_group && s.blood_group ? `
                  <div class="field-item">
                    <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">Blood:</span>
                    <span class="field-val blood-badge">${s.blood_group}</span>
                  </div>
                ` : ""}
              </div>
            </div>

            <!-- Bottom Wave -->
            <div class="bottom-wave-svg">
              <svg viewBox="0 0 320 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M0 25 C80 10, 240 40, 320 20 V60 H0 Z" fill="${primaryColor}" opacity="0.4"/>
                <path d="M0 35 C80 20, 240 50, 320 30 V60 H0 Z" fill="${primaryColor}"/>
              </svg>
            </div>
          </div>

          <!-- BACK SIDE -->
          <div class="card card-vertical card-back">
            <!-- Background Watermark & Crease -->
            <div class="card-bg-watermark">
              <svg width="100%" height="100%" viewBox="0 0 320 504" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M-30 140 C50 110, 100 200, 200 130 C300 60, 350 180, 400 130" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 170 C50 140, 100 230, 200 160 C300 95, 350 210, 400 160" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 200 C50 170, 100 260, 200 190 C300 125, 350 240, 400 190" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 230 C50 200, 100 290, 200 220 C300 155, 350 270, 400 220" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <!-- Crease divider in the middle -->
                <path d="M-10 240 C90 205, 230 275, 330 240 L330 255 C230 290, 90 220, -10 255 Z" fill="#ffffff" />
                <path d="M-10 240 C90 205, 230 275, 330 240" stroke="#e2e8f0" stroke-width="0.8"/>
                <path d="M-10 255 C90 220, 230 290, 330 255" stroke="#cbd5e1" stroke-width="0.8"/>
              </svg>
            </div>

            <!-- Top Left Wave -->
            <div class="top-left-wave-svg">
              <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
                <path d="M0 0 H115 C100 20, 85 45, 65 52 C45 60, 60 90, 45 108 C30 125, 20 110, 0 125 Z" fill="${primaryColor}" opacity="0.35"/>
                <path d="M0 0 H95 C80 15, 70 35, 55 40 C35 45, 50 75, 35 90 C20 105, 10 95, 0 108 Z" fill="${primaryColor}"/>
              </svg>
            </div>

            <div class="qr-code-container">
              ${settings.show_qr_code ? `
                <div class="qr-code-frame">
                  <img src="${qrUrl}" class="qr-code-img" />
                </div>
              ` : ""}
              <div class="school-name-text-back">${finalSchoolName}</div>
            </div>

            <div class="school-details-back">
              ${schoolAddress ? `<p class="school-detail-item">📍 ${schoolAddress}</p>` : ""}
              ${schoolPhone || schoolEmail ? `
                <p class="school-detail-item">
                  ${schoolPhone ? `📞 ${schoolPhone}` : ""}
                  ${schoolPhone && schoolEmail ? "  |  " : ""}
                  ${schoolEmail ? `✉️ ${schoolEmail}` : ""}
                </p>
              ` : ""}
            </div>

            <div class="socials-container">
              <div class="social-icons-row">
                <span class="social-icon-circle">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </span>
                <span class="social-icon-circle">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </span>
                <span class="social-icon-circle">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </span>
                <span class="social-icon-circle">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 00-2.11-2.108C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.51C.742 4.547.222 5.067.11 6.163 0 8.07 0 12.07 0 12.07s0 4.01.11 5.908c.112 1.096.632 1.616 1.702 1.728 1.87.51 9.388.51 9.388.51s7.518 0 9.388-.51a3.003 3.003 0 002.11-2.108c.11-1.898.11-5.908.11-5.908s0-4.002-.11-5.907zM9.545 15.568V8.568l6.18 3.5z"/></svg>
                </span>
              </div>
              <div class="social-handle-text">@${finalSchoolName.toLowerCase().replace(/[^a-z0-9]/g, "")}</div>
            </div>

            <!-- Bottom Wave -->
            <div class="bottom-wave-svg">
              <svg viewBox="0 0 320 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M0 25 C80 10, 240 40, 320 20 V60 H0 Z" fill="${primaryColor}" opacity="0.4"/>
                <path d="M0 35 C80 20, 240 50, 320 30 V60 H0 Z" fill="${primaryColor}"/>
              </svg>
            </div>
          </div>
        </div>
      `;
    } else {
      // Horizontal pair layout
      cardsHtml += `
        <div class="card-pair-wrapper card-pair-horizontal-wrapper">
          <!-- FRONT SIDE -->
          <div class="card card-horizontal card-front">
            <!-- Background Watermark & Crease -->
            <div class="card-bg-watermark">
              <svg width="100%" height="100%" viewBox="0 0 504 320" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M-30 80 C50 50, 100 140, 200 90 C300 40, 350 120, 450 90" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 120 C50 90, 100 180, 200 130 C300 80, 350 160, 450 130" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <!-- Divider shadow lines -->
                <path d="M150,-10 Q170 120 120 200 T150 330" stroke="#cbd5e1" stroke-width="1.5" fill="none" opacity="0.3"/>
              </svg>
            </div>

            <!-- Top Left Wave -->
            <div class="top-left-wave-svg">
              <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
                <path d="M0 0 H115 C100 20, 85 45, 65 52 C45 60, 60 90, 45 108 C30 125, 20 110, 0 125 Z" fill="${primaryColor}" opacity="0.35"/>
                <path d="M0 0 H95 C80 15, 70 35, 55 40 C35 45, 50 75, 35 90 C20 105, 10 95, 0 108 Z" fill="${primaryColor}"/>
              </svg>
            </div>

            <div class="card-horizontal-body">
              <div class="left-col">
                <div class="photo-frame">
                  ${studentPhoto}
                </div>
                <h2 class="student-name text-center" style="font-size: 18px; margin-top: 8px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.first_name} ${s.last_name || ""}</h2>
                <div class="student-role-badge text-center" style="color: ${primaryColor}; font-size: 9.5px; font-weight: 700; margin-top: 2px;">STUDENT</div>
              </div>

              <div class="right-col">
                <div class="card-header-block-horizontal">
                  ${logoBlockHtml}
                  <div class="school-name-text" style="text-align: left; font-size: 15px; max-width: 260px;">${finalSchoolName}</div>
                </div>

                <div class="fields-list" style="margin-top: 10px; gap: 4px; align-items: flex-start;">
                  ${settings.show_roll_number ? `
                    <div class="field-item">
                      <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">ID:</span>
                      <span class="field-val" style="color: #475569; font-weight: 500;">${s.registration_number || s.roll_number || "—"}</span>
                    </div>
                  ` : ""}

                  ${settings.show_emergency_contact ? `
                    <div class="field-item">
                      <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">Phone:</span>
                      <span class="field-val" style="color: #475569; font-weight: 500;">${s.emergency_contact || "—"}</span>
                    </div>
                  ` : ""}
                  ${settings.show_class && (s.class_name || s.section_name) ? `
                    <div class="field-item">
                      <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">Class:</span>
                      <span class="field-val" style="color: #475569; font-weight: 500;">${s.class_name || ""} ${s.section_name ? `(${s.section_name})` : ""}</span>
                    </div>
                  ` : ""}
                  ${settings.show_dob && s.date_of_birth ? `
                    <div class="field-item">
                      <span class="field-label" style="width: 55px; flex-shrink: 0; font-weight: 700; color: #0f294a;">D.O.B:</span>
                      <span class="field-val" style="color: #475569; font-weight: 500;">${s.date_of_birth}</span>
                    </div>
                  ` : ""}
                </div>
              </div>
            </div>

            <!-- Bottom Wave -->
            <div class="bottom-wave-svg">
              <svg viewBox="0 0 320 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M0 25 C80 10, 240 40, 320 20 V60 H0 Z" fill="${primaryColor}" opacity="0.4"/>
                <path d="M0 35 C80 20, 240 50, 320 30 V60 H0 Z" fill="${primaryColor}"/>
              </svg>
            </div>
          </div>

          <!-- BACK SIDE -->
          <div class="card card-horizontal card-back">
            <!-- Background Watermark & Crease -->
            <div class="card-bg-watermark">
              <svg width="100%" height="100%" viewBox="0 0 504 320" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M-30 80 C50 50, 100 140, 200 90 C300 40, 350 120, 450 90" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
                <path d="M-30 120 C50 90, 100 180, 200 130 C300 80, 350 160, 450 130" stroke="#0f294a" stroke-width="0.6" fill="none" opacity="0.04"/>
              </svg>
            </div>

            <!-- Top Left Wave -->
            <div class="top-left-wave-svg">
              <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
                <path d="M0 0 H115 C100 20, 85 45, 65 52 C45 60, 60 90, 45 108 C30 125, 20 110, 0 125 Z" fill="${primaryColor}" opacity="0.35"/>
                <path d="M0 0 H95 C80 15, 70 35, 55 40 C35 45, 50 75, 35 90 C20 105, 10 95, 0 108 Z" fill="${primaryColor}"/>
              </svg>
            </div>

            <div class="card-horizontal-body" style="padding: 24px 30px; align-items: center; justify-content: space-between;">
              <div class="left-col" style="justify-content: center; align-items: center; width: 160px; border-right: 1px dashed #e2e8f0; padding-right: 16px; box-sizing: border-box; height: 100%;">
                ${settings.show_qr_code ? `
                  <div class="qr-code-frame" style="margin-top: 0;">
                    <img src="${qrUrl}" class="qr-code-img" style="width: 85px; height: 85px;" />
                  </div>
                ` : ""}
                <div class="school-name-text-back" style="font-size: 12px; margin-top: 8px; max-width: 140px;">${finalSchoolName}</div>
              </div>

              <div class="right-col" style="justify-content: center; align-items: flex-start; padding-left: 24px; flex-grow: 1; height: 100%; box-sizing: border-box;">
                <div class="school-details-back" style="text-align: left; margin: 0; width: 100%;">
                  ${schoolAddress ? `<p class="school-detail-item" style="text-align: left; font-size: 11px;">📍 ${schoolAddress}</p>` : ""}
                  ${schoolPhone || schoolEmail ? `
                    <p class="school-detail-item" style="text-align: left; font-size: 11px;">
                      ${schoolPhone ? `📞 ${schoolPhone}` : ""}
                      ${schoolPhone && schoolEmail ? "  |  " : ""}
                      ${schoolEmail ? `✉️ ${schoolEmail}` : ""}
                    </p>
                  ` : ""}
                </div>

                <div class="socials-container" style="margin-top: 15px; align-items: flex-start; margin-bottom: 0;">
                  <div class="social-icons-row" style="justify-content: flex-start;">
                    <span class="social-icon-circle" style="width: 26px; height: 26px;"><svg viewBox="0 0 24 24" fill="currentColor" style="width: 12px; height: 12px;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></span>
                    <span class="social-icon-circle" style="width: 26px; height: 26px;"><svg viewBox="0 0 24 24" fill="currentColor" style="width: 12px; height: 12px;"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></span>
                    <span class="social-icon-circle" style="width: 26px; height: 26px;"><svg viewBox="0 0 24 24" fill="currentColor" style="width: 12px; height: 12px;"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></span>
                  </div>
                  <div class="social-handle-text" style="font-size: 13px;">@${finalSchoolName.toLowerCase().replace(/[^a-z0-9]/g, "")}</div>
                </div>
              </div>
            </div>

            <!-- Bottom Wave -->
            <div class="bottom-wave-svg">
              <svg viewBox="0 0 320 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M0 25 C80 10, 240 40, 320 20 V60 H0 Z" fill="${primaryColor}" opacity="0.4"/>
                <path d="M0 35 C80 20, 240 50, 320 30 V60 H0 Z" fill="${primaryColor}"/>
              </svg>
            </div>
          </div>
        </div>
      `;
    }
  });

  printWindow.document.write(`
    <html>
      <head>
        <title>Print Student ID Cards - AltRix</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
          
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f1f5f9;
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            justify-content: center;
          }

          .card-pair-wrapper {
            display: flex;
            flex-direction: row;
            gap: 20px;
            page-break-inside: avoid;
            background-color: transparent;
            padding: 10px;
            border-radius: 24px;
          }

          .card {
            width: 320px;
            height: 504px;
            border-radius: 20px;
            overflow: hidden;
            background: #ffffff;
            box-shadow: 0 10px 25px rgba(15, 41, 74, 0.08);
            position: relative;
            box-sizing: border-box;
            border: 1px solid #e2e8f0;
            display: flex;
            flex-direction: column;
            align-items: center;
          }

          .card-horizontal {
            width: 504px;
            height: 320px;
            flex-direction: row;
          }

          .card-bg-watermark {
            position: absolute;
            inset: 0;
            z-index: 1;
            pointer-events: none;
            overflow: hidden;
          }

          .top-left-wave-svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 115px;
            height: 115px;
            z-index: 2;
            pointer-events: none;
          }

          .bottom-wave-svg {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 48px;
            z-index: 2;
            pointer-events: none;
          }

          .card-header-block {
            margin-top: 24px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 3;
            width: 90%;
          }

          .school-logo-print {
            height: 54px;
            width: auto;
            max-width: 180px;
            object-fit: contain;
            margin-bottom: 6px;
          }

          .logo-placeholder-box {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            margin-bottom: 2px;
          }

          .logo-placeholder-text {
            font-family: 'Outfit', sans-serif;
            font-weight: 900;
            font-size: 15px;
            line-height: 0.9;
            text-align: center;
          }

          .school-name-text {
            font-family: 'Outfit', sans-serif;
            font-size: 15px;
            font-weight: 800;
            color: #0f294a;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 4px;
            line-height: 1.2;
            text-align: center;
            max-width: 260px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
          }

          .photo-frame-container {
            margin-top: 14px;
            z-index: 3;
            display: flex;
            justify-content: center;
            width: 100%;
          }

          .photo-frame {
            width: 95px;
            height: 115px;
            border-radius: 8px 38px 8px 8px;
            border: 3px solid #f1f5f9;
            box-shadow: 0 4px 10px rgba(15, 41, 74, 0.06);
            overflow: hidden;
            background-color: #f8fafc;
            display: flex;
            justify-content: center;
            align-items: center;
          }

          .student-photo-print {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .student-photo-print-placeholder {
            font-size: 40px;
            color: #cbd5e1;
          }

          .student-info-block {
            margin-top: 10px;
            text-align: left;
            z-index: 3;
            width: 100%;
            padding: 0 24px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }

          .student-name {
            font-family: 'Outfit', sans-serif;
            font-size: 22px;
            font-weight: 800;
            color: #0f294a;
            margin: 0;
            text-transform: uppercase;
            line-height: 1.1;
            text-align: center;
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .student-role-badge {
            font-family: 'Outfit', sans-serif;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 2.5px;
            text-transform: uppercase;
            margin-top: 2px;
            margin-bottom: 6px;
            text-align: center;
            width: 100%;
          }

          .fields-list {
            display: flex;
            flex-direction: column;
            gap: 3px;
            width: 100%;
            align-items: flex-start;
          }

          .field-item {
            font-size: 13.5px;
            color: #475569;
            line-height: 1.3;
            display: flex;
            justify-content: flex-start;
            align-items: center;
            width: 100%;
          }

          .field-label {
            font-weight: 700;
            color: #0f294a;
            margin-right: 6px;
          }

          .field-val {
            font-weight: 500;
            color: #1e293b;
          }

          .card-back {
            background: #ffffff;
            justify-content: space-between;
            padding: 40px 20px 48px 20px;
          }

          .qr-code-container {
            z-index: 3;
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: 15px;
          }

          .qr-code-frame {
            border: 3.5px solid #0f294a;
            padding: 6px;
            border-radius: 12px;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(15, 41, 74, 0.05);
          }

          .qr-code-img {
            width: 95px;
            height: 95px;
            display: block;
          }

          .school-name-text-back {
            font-family: 'Outfit', sans-serif;
            font-size: 14px;
            font-weight: 800;
            color: #0f294a;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 10px;
            line-height: 1.2;
            text-align: center;
            max-width: 220px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
          }

          .school-details-back {
            text-align: center;
            z-index: 3;
            width: 90%;
            margin: 10px auto;
          }

          .school-detail-item {
            font-size: 11px;
            font-weight: 600;
            color: #475569;
            line-height: 1.4;
            margin: 4px 0;
            text-align: center;
          }

          .socials-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 3;
            width: 100%;
            gap: 6px;
            margin-bottom: 12px;
          }

          .social-icons-row {
            display: flex;
            gap: 12px;
            justify-content: center;
            align-items: center;
          }

          .social-icon-circle {
            width: 28px;
            height: 28px;
            background-color: #0f294a;
            color: #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }

          .social-icon-circle svg {
            width: 14px;
            height: 14px;
          }

          .social-handle-text {
            font-family: 'Outfit', sans-serif;
            font-size: 13px;
            font-weight: 800;
            color: #0f294a;
            margin-top: 2px;
          }

          .card-pair-horizontal-wrapper {
            flex-direction: column;
            gap: 30px;
          }

          .card-horizontal-body {
            display: flex;
            flex-direction: row;
            width: 100%;
            height: 100%;
            padding: 20px 24px;
            z-index: 3;
            box-sizing: border-box;
          }

          .card-horizontal .left-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 160px;
            border-right: 1px dashed #e2e8f0;
            padding-right: 16px;
            box-sizing: border-box;
          }

          .card-horizontal .right-col {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-left: 20px;
            box-sizing: border-box;
          }

          .card-horizontal .photo-frame {
            width: 100px;
            height: 120px;
          }

          .card-header-block-horizontal {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }

          .card-header-block-horizontal .school-name-text {
            text-align: left;
          }

          @media print {
            body {
              background: none;
              padding: 0;
              margin: 0;
            }
            .card-pair-wrapper {
              box-shadow: none;
              padding: 0;
              margin-bottom: 40px;
              page-break-inside: avoid;
            }
            .card {
              box-shadow: none;
              border: 1px solid #cbd5e1;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        ${cardsHtml}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}
