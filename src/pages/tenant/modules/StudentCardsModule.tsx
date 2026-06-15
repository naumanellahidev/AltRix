import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  CreditCard, Search, Sliders, Users, Printer, Settings, Edit, 
  Upload, Check, Shield, User, Calendar, Droplet, Phone, Plus, Loader2, Eye
} from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { printStudentCards } from "@/lib/id-card-print";

type CardSettings = {
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

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  registration_number: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  card_valid_until: string | null;
  profile_image_url: string | null;
  emergency_contact: string | null;
  section_id: string | null;
  class_name?: string;
  section_name?: string;
};

type ClassOption = { id: string; name: string };
type SectionOption = { id: string; name: string; class_id: string };

const DEFAULT_SETTINGS = (schoolId: string): CardSettings => ({
  school_id: schoolId,
  card_layout: "vertical",
  primary_color: "#ea580c",
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

type IDCardProps = {
  student: {
    id?: string;
    first_name: string;
    last_name?: string | null;
    roll_number?: string | null;
    registration_number?: string | null;
    date_of_birth?: string | null;
    blood_group?: string | null;
    profile_image_url?: string | null;
    emergency_contact?: string | null;
    class_name?: string;
    section_name?: string;
  };
  settings: CardSettings | null;
  schoolName: string;
  schoolLogo: string | null;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolEmail?: string | null;
  side: "front" | "back";
  scaleClassName?: string;
};

function IDCard({ 
  student, 
  settings, 
  schoolName, 
  schoolLogo, 
  schoolAddress, 
  schoolPhone, 
  schoolEmail, 
  side, 
  scaleClassName = "" 
}: IDCardProps) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [student.profile_image_url]);

  const isVertical = settings?.card_layout === "vertical";
  const primaryBgColor = settings?.primary_color || "#ea580c";
  const firstName = student.first_name || "John";
  const lastName = student.last_name || "Doe";
  const dynamicEmail = `${firstName.toLowerCase()}${lastName ? `.${lastName.toLowerCase()}` : ""}@yourmail.com`;
  const qrData = `student_id:${student.id || ""}\nname:${firstName} ${lastName}\nroll:${student.roll_number || ""}\nclass:${student.class_name || ""}`;

  return (
    <div 
      className={`relative border border-slate-200/80 rounded-2xl bg-white shadow-soft flex overflow-hidden select-none shrink-0 ${
        isVertical ? "w-[260px] h-[410px] flex-col" : "w-[410px] h-[260px] flex-row"
      } ${scaleClassName}`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Diagonal Crease Divider & Watermark lines */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        <svg width="100%" height="100%" viewBox="0 0 320 500" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path d="M-30 140 C50 110, 100 200, 200 130 C300 60, 350 180, 400 130" stroke="#0f294a" strokeWidth="0.6" fill="none" opacity="0.04"/>
          <path d="M-30 170 C50 140, 100 230, 200 160 C300 95, 350 210, 400 160" stroke="#0f294a" strokeWidth="0.6" fill="none" opacity="0.04"/>
          <path d="M-30 200 C50 170, 100 260, 200 190 C300 125, 350 240, 400 190" stroke="#0f294a" strokeWidth="0.6" fill="none" opacity="0.04"/>
          <path d="M-30 230 C50 200, 100 290, 200 220 C300 155, 350 270, 400 220" stroke="#0f294a" strokeWidth="0.6" fill="none" opacity="0.04"/>

          <path d="M-10 240 C90 205, 230 275, 330 240 L330 255 C230 290, 90 220, -10 255 Z" fill="#ffffff" />
          <path d="M-10 240 C90 205, 230 275, 330 240" stroke="#e2e8f0" strokeWidth="0.8"/>
          <path d="M-10 255 C90 220, 230 290, 330 255" stroke="#cbd5e1" strokeWidth="0.8"/>
        </svg>
      </div>

      <div className="absolute top-0 left-0 w-24 h-24 z-10 pointer-events-none">
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <path d="M0 0 H115 C100 20, 85 45, 65 52 C45 60, 60 90, 45 108 C30 125, 20 110, 0 125 Z" fill={primaryBgColor} opacity="0.35"/>
          <path d="M0 0 H95 C80 15, 70 35, 55 40 C35 45, 50 75, 35 90 C20 105, 10 95, 0 108 Z" fill={primaryBgColor}/>
        </svg>
      </div>

      {side === "front" ? (
        isVertical ? (
          <>
            <div className="mt-5 text-center flex flex-col items-center z-10 px-4 w-full">
              {settings?.show_logo ? (
                schoolLogo ? (
                  <img src={schoolLogo} alt="Logo" className="h-12 w-auto max-w-[150px] object-contain mb-1.5" />
                ) : (
                  <div className="flex items-center gap-1.5 mb-1.5 bg-white/50 px-2.5 py-0.5 rounded">
                    <span className="font-extrabold text-[9px] leading-none text-left" style={{ color: primaryBgColor, fontFamily: "'Outfit', sans-serif" }}>
                      LOGO
                    </span>
                  </div>
                )
              ) : null}
              <div className="text-[12px] font-extrabold uppercase tracking-wide text-[#0f294a] leading-tight max-w-[220px] text-center mx-auto line-clamp-2 break-words" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {schoolName}
              </div>
            </div>

            <div className="mt-2.5 flex justify-center z-10">
              <div className="w-20 h-24 border-[2.5px] border-slate-100 shadow-sm overflow-hidden bg-slate-50 flex items-center justify-center" style={{ borderRadius: "8px 38px 8px 8px" }}>
                {student.profile_image_url && !imageError ? (
                  <img 
                    src={student.profile_image_url} 
                    alt="Photo" 
                    className="w-full h-full object-cover" 
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <User className="h-8 w-8 text-slate-300" />
                )}
              </div>
            </div>

            <div className="mt-2 z-10 px-3.5 flex-grow flex flex-col justify-start mb-6 w-full">
              <h3 className="text-[18px] font-extrabold text-[#0f294a] uppercase truncate max-w-full leading-none text-center w-full" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {firstName} {lastName}
              </h3>
              <div className="text-[8.5px] font-bold tracking-widest uppercase mt-1 text-center w-full" style={{ color: primaryBgColor, fontFamily: "'Outfit', sans-serif" }}>
                STUDENT
              </div>

              <div className="w-full space-y-0.5 text-[11.5px] text-slate-500 mt-1 text-left">
                {settings?.show_roll_number && (
                  <div className="flex items-center">
                    <span className="font-bold text-[#0f294a] w-14 shrink-0">ID:</span>
                    <span className="text-slate-600 font-medium">{student.registration_number || student.roll_number || "—"}</span>
                  </div>
                )}
                {settings?.show_emergency_contact && (
                  <div className="flex items-center">
                    <span className="font-bold text-[#0f294a] w-14 shrink-0">Phone:</span>
                    <span className="text-slate-600 font-medium">{student.emergency_contact || "—"}</span>
                  </div>
                )}
                {settings?.show_class && (student.class_name || student.section_name) && (
                  <div className="flex items-center">
                    <span className="font-bold text-[#0f294a] w-14 shrink-0">Class:</span>
                    <span className="text-slate-600 font-medium">{student.class_name || ""} {student.section_name ? `(${student.section_name})` : ""}</span>
                  </div>
                )}
                {settings?.show_dob && student.date_of_birth && (
                  <div className="flex items-center">
                    <span className="font-bold text-[#0f294a] w-14 shrink-0">D.O.B:</span>
                    <span className="text-slate-600 font-medium">{student.date_of_birth}</span>
                  </div>
                )}
                {settings?.show_blood_group && student.blood_group && (
                  <div className="flex items-center">
                    <span className="font-bold text-[#0f294a] w-14 shrink-0">Blood:</span>
                    <span className="text-red-500 font-bold">{student.blood_group}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-row w-full h-full p-4 z-10 justify-between items-center box-border gap-4">
            <div className="flex flex-col items-center justify-center w-[130px] shrink-0">
              <div className="w-[85px] h-[100px] border-[2.5px] border-slate-100 shadow-sm overflow-hidden bg-slate-50 flex items-center justify-center" style={{ borderRadius: "6px 32px 6px 6px" }}>
                {student.profile_image_url && !imageError ? (
                  <img 
                    src={student.profile_image_url} 
                    alt="Photo" 
                    className="w-full h-full object-cover" 
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <User className="h-6 w-6 text-slate-300" />
                )}
              </div>
              <h3 className="text-[15px] font-extrabold text-[#0f294a] uppercase truncate max-w-full mt-1.5 leading-tight text-center w-full" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {firstName} {lastName}
              </h3>
              <div className="text-[8px] font-bold tracking-wider uppercase mt-0.5 text-center w-full" style={{ color: primaryBgColor }}>
                STUDENT
              </div>
            </div>

            <div className="flex-grow flex flex-col justify-between h-full py-1.5 text-left">
              <div className="text-left flex flex-col items-start">
                {settings?.show_logo ? (
                  schoolLogo ? (
                    <img src={schoolLogo} alt="Logo" className="h-11 w-auto max-w-[130px] object-contain mb-0.5" />
                  ) : (
                    <div className="flex items-center gap-1.5 mb-0.5 bg-white/50 px-2 py-0.5 rounded">
                      <span className="font-extrabold text-[8px] leading-none text-left" style={{ color: primaryBgColor }}>
                        LOGO
                      </span>
                    </div>
                  )
                ) : null}
                <div className="text-[12px] font-extrabold uppercase text-[#0f294a] leading-tight max-w-[200px] line-clamp-2 break-words" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {schoolName}
                </div>
              </div>

              <div className="space-y-0.5 text-[10.5px] text-slate-500 mt-1 text-left w-full">
                {settings?.show_roll_number && (
                  <div className="flex">
                    <span className="font-bold text-[#0f294a] w-12 shrink-0">ID:</span>
                    <span className="text-slate-600 font-medium">{student.registration_number || student.roll_number || "—"}</span>
                  </div>
                )}
                {settings?.show_emergency_contact && (
                  <div className="flex">
                    <span className="font-bold text-[#0f294a] w-12 shrink-0">Phone:</span>
                    <span className="text-slate-600 font-medium">{student.emergency_contact || "—"}</span>
                  </div>
                )}
                {settings?.show_class && (
                  <div className="flex">
                    <span className="font-bold text-[#0f294a] w-12 shrink-0">Class:</span>
                    <span className="text-slate-600 font-medium">{student.class_name || "—"}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : (
        isVertical ? (
          <div className="flex flex-col justify-between h-full w-full py-6 px-4 z-10 box-border text-center">
            <div className="flex flex-col items-center justify-center mt-6 flex-grow">
              {settings?.show_qr_code ? (
                <div className="border-[2.5px] border-[#0f294a] p-1.5 rounded-xl bg-white shadow-md">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`} 
                    className="w-24 h-24 block" 
                    alt="QR" 
                  />
                </div>
              ) : null}
              <div className="text-[12px] font-bold text-[#0f294a] mt-3 uppercase tracking-wide leading-tight max-w-[180px] text-center line-clamp-2 break-words" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {schoolName}
              </div>
            </div>

            <div className="w-full text-center space-y-1 text-slate-500 z-10 px-2 my-2">
              {schoolAddress && (
                <p className="text-[9.5px] font-semibold text-slate-600 leading-tight">
                  📍 {schoolAddress}
                </p>
              )}
              {(schoolPhone || schoolEmail) && (
                <p className="text-[9.5px] font-semibold text-slate-600 leading-tight">
                  {schoolPhone ? `📞 ${schoolPhone}` : ""}
                  {schoolPhone && schoolEmail ? "  |  " : ""}
                  {schoolEmail ? `✉️ ${schoolEmail}` : ""}
                </p>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 w-full mb-4 z-10">
              <div className="flex gap-3 justify-center items-center">
                <span className="w-7.5 h-7.5 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </span>
                <span className="w-7.5 h-7.5 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </span>
                <span className="w-7.5 h-7.5 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </span>
                <span className="w-7.5 h-7.5 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M23.498 6.163a3.003 3.003 0 00-2.11-2.108C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.51C.742 4.547.222 5.067.11 6.163 0 8.07 0 12.07 0 12.07s0 4.01.11 5.908c.112 1.096.632 1.616 1.702 1.728 1.87.51 9.388.51 9.388.51s7.518 0 9.388-.51a3.003 3.003 0 002.11-2.108c.11-1.898.11-5.908.11-5.908s0-4.002-.11-5.907zM9.545 15.568V8.568l6.18 3.5z"/></svg>
                </span>
              </div>
              <div className="text-[11px] font-extrabold text-[#0f294a] mt-0.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
                @{(schoolName || "Our School").toLowerCase().replace(/[^a-z0-9]/g, "")}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-row w-full h-full p-5 z-10 justify-between items-center box-border gap-4 pb-8">
            <div className="flex flex-col items-center justify-center w-[120px] shrink-0">
              {settings?.show_qr_code ? (
                <div className="border-[2.5px] border-[#0f294a] p-1 rounded-lg bg-white shadow-sm">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`} 
                    className="w-14 h-14 block" 
                    alt="QR" 
                  />
                </div>
              ) : null}
              <div className="text-[9px] font-bold text-[#0f294a] mt-1.5 uppercase tracking-wide leading-tight max-w-[110px] text-center line-clamp-2 break-words" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {schoolName}
              </div>
            </div>

            <div className="flex-grow flex flex-col justify-center h-full gap-2 text-left">
              <div className="text-left space-y-1 text-slate-500">
                {schoolAddress && (
                  <p className="text-[8.5px] font-semibold text-slate-500 leading-tight">
                    📍 {schoolAddress}
                  </p>
                )}
                {schoolPhone && (
                  <p className="text-[8.5px] font-semibold text-slate-500 leading-tight">
                    📞 {schoolPhone}
                  </p>
                )}
                {schoolEmail && (
                  <p className="text-[8.5px] font-semibold text-slate-500 leading-tight">
                    ✉️ {schoolEmail}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1.5 justify-center items-center">
                  <span className="w-7 h-7 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </span>
                  <span className="w-7 h-7 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </span>
                  <span className="w-7 h-7 bg-[#0f294a] text-white rounded-full flex items-center justify-center p-1.5 shadow-sm transition-transform hover:scale-110">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </span>
                </div>
                <span className="text-[9.5px] font-extrabold text-[#0f294a]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  @{(schoolName || "Our School").toLowerCase().replace(/[^a-z0-9]/g, "")}
                </span>
              </div>
            </div>
          </div>
        )
      )}

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 w-full h-8 z-10 pointer-events-none">
        <svg viewBox="0 0 320 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="none">
          <path d="M0 25 C80 10, 240 40, 320 20 V60 H0 Z" fill={primaryBgColor} opacity="0.4"/>
          <path d="M0 35 C80 20, 240 50, 320 30 V60 H0 Z" fill={primaryBgColor}/>
        </svg>
      </div>
    </div>
  );
}

export function StudentCardsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" && tenant.school ? tenant.school.id : null), [tenant.status, tenant.school]);
  const schoolName = useMemo(() => (tenant.status === "ready" && tenant.school ? tenant.school.name : "Our School"), [tenant.status, tenant.school]);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [schoolAddress, setSchoolAddress] = useState<string>("");
  const [schoolPhone, setSchoolPhone] = useState<string>("");
  const [schoolEmail, setSchoolEmail] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const fetchSchoolDetails = async () => {
      try {
        const { data } = await supabase
          .from("schools")
          .select("logo_url, address, phone, email")
          .eq("id", schoolId)
          .maybeSingle();
        if (data) {
          if (data.logo_url) setSchoolLogo(data.logo_url);
          setSchoolAddress(data.address || "");
          setSchoolPhone(data.phone || "");
          setSchoolEmail(data.email || "");
        }
      } catch (err) {
        console.error("Failed to load school details:", err);
      }
    };
    fetchSchoolDetails();
  }, [schoolId]);

  const perms = usePermissions(schoolId);
  const canManageSettings = useMemo(() => {
    return perms.roles.some(r => ["super_admin", "school_owner", "principal", "vice_principal", "school_admin"].includes(r));
  }, [perms.roles]);

  const [settings, setSettings] = useState<CardSettings | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedSection, setSelectedSection] = useState("all");

  // Selection
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editPhotoError, setEditPhotoError] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setEditPhotoError(false);
  }, [editingStudent?.profile_image_url]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);

  // Preview Modal State
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({
    first_name: "",
    last_name: "",
    roll_number: "",
    registration_number: "",
    date_of_birth: "",
    blood_group: "",
    emergency_contact: "",
    card_valid_until: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    class_section_id: "",
    profile_image_url: "",
  });

  // Export Card After Creation State
  const [createdStudentForCard, setCreatedStudentForCard] = useState<Student | null>(null);
  const [isCreatedSuccessOpen, setIsCreatedSuccessOpen] = useState(false);

  // Preset Colors
  const presetColors = [
    "#ea580c", // Mockup Vibrant Orange
    "#1e40af", // Indigo/Blue
    "#0f766e", // Teal
    "#15803d", // Green
    "#be123c", // Rose
    "#4338ca", // Purple
    "#0f172a", // Slate/Black
    "#a21caf", // Magenta
  ];

  // Fetch classes and sections
  useEffect(() => {
    if (!schoolId) return;
    const fetchMetadata = async () => {
      try {
        // Classes
        const { data: clsData } = await supabase
          .from("academic_classes")
          .select("id, name")
          .eq("school_id", schoolId)
          .order("name");
        
        // Sections
        const { data: secData } = await supabase
          .from("class_sections")
          .select("id, name, class_id")
          .eq("school_id", schoolId)
          .order("name");

        setClasses(clsData || []);
        setSections(secData || []);
      } catch (err) {
        console.error("Failed to load school academic metadata:", err);
      }
    };
    fetchMetadata();
  }, [schoolId]);

  // Load Settings and Students
  const loadData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      // 1. Fetch settings from backend API (or Supabase)
      const { data: settingsData, error: settingsErr } = await supabase
        .from("school_id_card_settings")
        .select("*")
        .eq("school_id", schoolId)
        .maybeSingle();

      if (settingsErr) throw settingsErr;
      setSettings(settingsData ? (settingsData as CardSettings) : DEFAULT_SETTINGS(schoolId));

      // 2. Fetch students list
      const { data: studentsData, error: studentsErr } = await supabase
        .from("students")
        .select(`
          id, first_name, last_name, roll_number, registration_number, 
          date_of_birth, blood_group, card_valid_until, profile_image_url, emergency_contact
        `)
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("first_name");

      if (studentsErr) throw studentsErr;

      // 3. Get enrollments to map class/section names
      const { data: enrollmentsData } = await supabase
        .from("student_enrollments")
        .select("student_id, class_section_id")
        .eq("school_id", schoolId)
        .is("end_date", null);

      const enrollmentMap = new Map<string, string>();
      enrollmentsData?.forEach(e => {
        enrollmentMap.set(e.student_id, e.class_section_id);
      });

      const mappedStudents: Student[] = (studentsData || []).map((s: any) => {
        const sectionId = enrollmentMap.get(s.id) || null;
        const sectionObj = sections.find(sec => sec.id === sectionId);
        const classObj = classes.find(c => c.id === sectionObj?.class_id);

        return {
          ...s,
          section_id: sectionId,
          class_name: classObj?.name || "",
          section_name: sectionObj?.name || "",
        };
      });

      setStudents(mappedStudents);
    } catch (err: any) {
      toast.error("Error loading student cards data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId && classes.length >= 0 && sections.length >= 0) {
      loadData();
    }
  }, [schoolId, classes.length, sections.length]);

  // Real-time synchronization subscriptions
  useEffect(() => {
    if (!schoolId) return;

    // Realtime channel for settings
    const settingsChannel = supabase
      .channel("id-card-settings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_id_card_settings", filter: `school_id=eq.${schoolId}` },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            setSettings(payload.new as CardSettings);
            toast.info("ID Card settings updated in real-time by admin", { id: "realtime-settings" });
          }
        }
      )
      .subscribe();

    // Realtime channel for student list
    const studentsChannel = supabase
      .channel("students-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students", filter: `school_id=eq.${schoolId}` },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(studentsChannel);
    };
  }, [schoolId, classes, sections]);

  // School Logo Upload
  const handleLogoUpload = async (file: File) => {
    if (!schoolId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${schoolId}/logo_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("student-photos")
        .upload(path, file, { cacheControl: "3600", upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: pubUrl } = supabase.storage
        .from("student-photos")
        .getPublicUrl(path);

      // Save to schools table
      const { error: dbErr } = await supabase
        .from("schools")
        .update({ logo_url: pubUrl.publicUrl })
        .eq("id", schoolId);

      if (dbErr) throw dbErr;

      setSchoolLogo(pubUrl.publicUrl);
      toast.success("School logo uploaded successfully!");
    } catch (err: any) {
      toast.error("Logo upload failed: " + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Save Settings
  const saveSettings = async (updatedSettings: CardSettings) => {
    if (!schoolId) return;
    setSavingSettings(true);
    try {
      const payload = {
        ...updatedSettings,
        updated_at: new Date().toISOString(),
      };

      let err = null;
      if (updatedSettings.id) {
        const { error } = await supabase
          .from("school_id_card_settings")
          .update(payload)
          .eq("id", updatedSettings.id);
        err = error;
      } else {
        const { error } = await supabase
          .from("school_id_card_settings")
          .insert(payload);
        err = error;
      }

      if (err) throw err;

      // Update school details in the database
      const { error: schoolErr } = await supabase
        .from("schools")
        .update({
          address: schoolAddress,
          phone: schoolPhone,
          email: schoolEmail,
        })
        .eq("id", schoolId);

      if (schoolErr) throw schoolErr;

      setSettings(updatedSettings);
      toast.success("Branding settings saved & synchronized everywhere!");
      // Reload settings to grab ID if it was inserted
      loadData();
    } catch (err: any) {
      toast.error("Failed to save card settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Student Photo Upload
  const handlePhotoUpload = async (file: File) => {
    if (!editingStudent || !schoolId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${schoolId}/${editingStudent.id}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("student-photos")
        .upload(path, file, { cacheControl: "3600", upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: pubUrl } = supabase.storage
        .from("student-photos")
        .getPublicUrl(path);

      setEditingStudent(prev => prev ? { ...prev, profile_image_url: pubUrl.publicUrl } : null);
      toast.success("Photo uploaded successfully!");
    } catch (err: any) {
      toast.error("Photo upload failed: " + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Save Student details
  const saveStudentDetails = async () => {
    if (!editingStudent || !schoolId) return;
    setSavingStudent(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({
          first_name: editingStudent.first_name,
          last_name: editingStudent.last_name,
          roll_number: editingStudent.roll_number,
          registration_number: editingStudent.registration_number,
          date_of_birth: editingStudent.date_of_birth,
          blood_group: editingStudent.blood_group,
          card_valid_until: editingStudent.card_valid_until,
          profile_image_url: editingStudent.profile_image_url,
          emergency_contact: editingStudent.emergency_contact,
        })
        .eq("id", editingStudent.id);

      if (error) throw error;
      toast.success("Student details updated successfully!");
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error("Failed to save student details: " + err.message);
    } finally {
      setSavingStudent(false);
    }
  };

  // Student Photo Upload for New Student Card
  const handleCreatePhotoUpload = async (file: File) => {
    if (!schoolId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${schoolId}/temp_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("student-photos")
        .upload(path, file, { cacheControl: "3600", upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: pubUrl } = supabase.storage
        .from("student-photos")
        .getPublicUrl(path);

      setNewStudent(prev => ({ ...prev, profile_image_url: pubUrl.publicUrl }));
      toast.success("Photo uploaded successfully!");
    } catch (err: any) {
      toast.error("Photo upload failed: " + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Create Student Card / Add Student logic
  const handleCreateStudent = async () => {
    if (!schoolId) return;
    if (!newStudent.first_name.trim()) {
      toast.error("First Name is required.");
      return;
    }
    setCreatingStudent(true);
    try {
      // 1. Insert student
      const studentCode = newStudent.registration_number.trim() || `STUDENT_${Date.now()}`;
      const { data: newStud, error: studentErr } = await supabase
        .from("students")
        .insert({
          school_id: schoolId,
          first_name: newStudent.first_name.trim(),
          last_name: newStudent.last_name.trim() || null,
          roll_number: newStudent.roll_number.trim() || null,
          registration_number: studentCode,
          student_code: studentCode,
          date_of_birth: newStudent.date_of_birth || null,
          blood_group: newStudent.blood_group || null,
          emergency_contact: newStudent.emergency_contact.trim() || null,
          card_valid_until: newStudent.card_valid_until || null,
          profile_image_url: newStudent.profile_image_url || null,
          status: "active",
        })
        .select("*")
        .single();

      if (studentErr) throw studentErr;

      // 2. Insert enrollment if section is selected
      if (newStudent.class_section_id) {
        const { error: enrollErr } = await supabase
          .from("student_enrollments")
          .insert({
            school_id: schoolId,
            student_id: newStud.id,
            class_section_id: newStudent.class_section_id,
            start_date: new Date().toISOString().split("T")[0],
          });
        if (enrollErr) {
          console.error("Failed to enroll student in section:", enrollErr);
        }
      }

      // Fetch the class/section names for the new student to render correctly
      let sectionName = "";
      let className = "";
      if (newStudent.class_section_id) {
        const secObj = sections.find(s => s.id === newStudent.class_section_id);
        const clsObj = classes.find(c => c.id === secObj?.class_id);
        sectionName = secObj?.name || "";
        className = clsObj?.name || "";
      }

      const createdStudent: Student = {
        id: newStud.id,
        first_name: newStud.first_name,
        last_name: newStud.last_name,
        roll_number: newStud.roll_number,
        registration_number: newStud.registration_number,
        date_of_birth: newStud.date_of_birth,
        blood_group: newStud.blood_group,
        card_valid_until: newStud.card_valid_until,
        profile_image_url: newStud.profile_image_url,
        emergency_contact: newStud.emergency_contact,
        section_id: newStudent.class_section_id || null,
        class_name: className,
        section_name: sectionName,
      };

      setCreatedStudentForCard(createdStudent);
      setIsCreateModalOpen(false);
      setIsCreatedSuccessOpen(true);
      toast.success("Student Card created successfully!");
      
      // Reset form
      setNewStudent({
        first_name: "",
        last_name: "",
        roll_number: "",
        registration_number: "",
        date_of_birth: "",
        blood_group: "",
        emergency_contact: "",
        card_valid_until: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        class_section_id: "",
        profile_image_url: "",
      });

      loadData();
    } catch (err: any) {
      toast.error("Failed to create student card: " + err.message);
    } finally {
      setCreatingStudent(false);
    }
  };

  // Filtering Logic
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const fullName = `${student.first_name} ${student.last_name || ""}`.toLowerCase();
      const code = (student.registration_number || "").toLowerCase();
      const roll = (student.roll_number || "").toLowerCase();
      const search = searchQuery.toLowerCase();

      const matchesSearch = fullName.includes(search) || code.includes(search) || roll.includes(search);
      
      const matchesClass = selectedClass === "all" || student.class_name === selectedClass;
      
      let matchesSection = true;
      if (selectedSection !== "all" && student.section_id !== selectedSection) {
        matchesSection = false;
      }

      return matchesSearch && matchesClass && matchesSection;
    });
  }, [students, searchQuery, selectedClass, selectedSection]);

  // Section options filtered by class
  const filteredSections = useMemo(() => {
    if (selectedClass === "all") return sections;
    const classObj = classes.find(c => c.name === selectedClass);
    return sections.filter(s => s.class_id === classObj?.id);
  }, [sections, classes, selectedClass]);

  // Handle student select check
  const handleSelectStudent = (id: string, checked: boolean) => {
    const next = new Set(selectedStudentIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedStudentIds(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
    } else {
      setSelectedStudentIds(new Set());
    }
  };

  // Printable layout window trigger
  const handlePrint = async () => {
    if (selectedStudentIds.size === 0) {
      toast.warning("Please select at least one student to print ID cards.");
      return;
    }
    const selectedStudents = students.filter(s => selectedStudentIds.has(s.id));
    try {
      await printStudentCards(
        supabase,
        schoolId!,
        selectedStudents,
        schoolLogo,
        schoolName
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Live card preview styling details
  const currentLayoutClass = settings?.card_layout === "vertical" 
    ? "w-[300px] h-[460px] flex-col" 
    : "w-[460px] h-[300px] flex-row";

  return (
    <div className="space-y-6 pb-12">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-blue-100 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight flex items-center gap-2">
            <CreditCard className="h-8 w-8 text-blue-600" />
            Student ID Cards Center
          </h1>
          <p className="text-muted-foreground text-sm">
            Configure, branding settings, search students, update profiles, and print high-quality ID cards in real-time.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={loadData}
          >
            Refresh
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Student Card
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            onClick={handlePrint}
            disabled={selectedStudentIds.size === 0}
          >
            <Printer className="h-4 w-4" />
            Print Selected ({selectedStudentIds.size})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-[60vh] flex flex-col justify-center items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-muted-foreground text-sm font-medium">Loading ID Card workspace...</p>
        </div>
      ) : (
        <Tabs defaultValue="cards" className="w-full">
          <TabsList className="bg-blue-50/50 p-1 rounded-xl mb-6">
            <TabsTrigger value="cards" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900 data-[state=active]:shadow-sm">
              <Users className="h-4 w-4 mr-2" />
              Student Cards Directory
            </TabsTrigger>
            {canManageSettings && (
              <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-blue-900 data-[state=active]:shadow-sm">
                <Settings className="h-4 w-4 mr-2" />
                Branding & Settings
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab 1: Cards Directory */}
          <TabsContent value="cards" className="space-y-6">
            <Card className="border-blue-100/60 shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-blue-50/20 border-b border-blue-50 pb-4">
                <CardTitle className="text-blue-900 text-lg flex items-center gap-2">
                  <Search className="h-5 w-5 text-blue-600" />
                  Search & Filters
                </CardTitle>
                <CardDescription>
                  Filter by name, class, and section, then select cards to print in bulk.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-blue-900 font-medium">Search Students</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, roll no..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 border-blue-100 focus-visible:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-blue-900 font-medium">Class</Label>
                    <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedSection("all"); }}>
                      <SelectTrigger className="border-blue-100">
                        <SelectValue placeholder="All Classes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Classes</SelectItem>
                        {classes.map(c => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-blue-900 font-medium">Section</Label>
                    <Select value={selectedSection} onValueChange={setSelectedSection}>
                      <SelectTrigger className="border-blue-100">
                        <SelectValue placeholder="All Sections" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sections</SelectItem>
                        {filteredSections.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end pb-0.5">
                    <Button 
                      variant="ghost" 
                      onClick={() => { setSearchQuery(""); setSelectedClass("all"); setSelectedSection("all"); }}
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50/50 w-full"
                    >
                      Reset Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selection Options & Summary */}
            <div className="flex justify-between items-center bg-blue-50/30 border border-blue-50 rounded-xl px-6 py-4">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="select-all"
                  checked={filteredStudents.length > 0 && selectedStudentIds.size === filteredStudents.length}
                  onCheckedChange={handleSelectAll}
                  className="border-blue-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <Label htmlFor="select-all" className="text-blue-950 font-semibold cursor-pointer text-sm">
                  Select All on Page ({filteredStudents.length} students)
                </Label>
              </div>

              <div className="text-sm text-blue-950 font-medium bg-blue-50 border border-blue-100 rounded-lg px-4 py-1.5 shadow-sm">
                Selected: <span className="font-bold text-blue-600">{selectedStudentIds.size}</span> / {students.length} Total
              </div>
            </div>

            {/* Student Grid */}
            {filteredStudents.length === 0 ? (
              <div className="h-48 flex flex-col justify-center items-center border border-dashed border-blue-200 rounded-xl bg-white p-6">
                <Users className="h-10 w-10 text-blue-300 mb-2" />
                <p className="text-blue-950 font-medium">No active students found</p>
                <p className="text-muted-foreground text-xs">Try adjusting your filters or search query.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredStudents.map(student => {
                  const isChecked = selectedStudentIds.has(student.id);
                  const isVertical = settings?.card_layout === "vertical";
                  const primaryBgColor = settings?.primary_color || "#1e40af";
                  const txtColor = settings?.text_color || "#ffffff";
                  
                  return (
                    <div 
                      key={student.id} 
                      className={`relative flex flex-col rounded-2xl border transition-all overflow-hidden ${
                        isChecked 
                          ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/5" 
                          : "border-slate-200 hover:border-blue-300 bg-white"
                      }`}
                    >
                      {/* Top Action Header */}
                      <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <Checkbox 
                          checked={isChecked}
                          onCheckedChange={(checked) => handleSelectStudent(student.id, !!checked)}
                          className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md"
                            onClick={() => {
                              setPreviewStudent(student);
                              setIsPreviewModalOpen(true);
                            }}
                            title="Preview Card"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md"
                            onClick={() => {
                              setEditingStudent({ ...student });
                              setIsEditModalOpen(true);
                            }}
                            title="Edit Student"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Realistic Mini Preview container */}
                      <div className="p-4 flex justify-center items-center bg-slate-50/50 flex-grow overflow-hidden">
                        <IDCard 
                          student={student}
                          settings={settings}
                          schoolName={schoolName}
                          schoolLogo={schoolLogo}
                          schoolAddress={schoolAddress}
                          schoolPhone={schoolPhone}
                          schoolEmail={schoolEmail}
                          side="front"
                          scaleClassName="scale-[0.8] origin-center"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Settings / Customizer */}
          {canManageSettings && (
            <TabsContent value="settings" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Branding customizer Form */}
                <div className="lg:col-span-5 space-y-6">
                  <Card className="border-blue-100/60 shadow-sm bg-white">
                    <CardHeader className="bg-blue-50/20 border-b border-blue-50">
                      <CardTitle className="text-blue-900 text-lg flex items-center gap-2">
                        <Sliders className="h-5 w-5 text-blue-600" />
                        ID Card Customizer
                      </CardTitle>
                      <CardDescription>
                        Branding configurations update instantly across the system.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-5">
                      
                      {/* Logo upload control */}
                      <div className="space-y-2 pb-4 border-b border-slate-100">
                        <Label className="text-slate-700 font-medium">School Brand Logo</Label>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                            {schoolLogo ? (
                              <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                            ) : (
                              <Upload className="h-6 w-6 text-slate-300" />
                            )}
                          </div>
                          <div className="flex-grow">
                            <label className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 cursor-pointer w-full text-center">
                              {uploadingLogo ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Upload className="h-4 w-4 mr-2" />
                              )}
                              Upload Logo
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleLogoUpload(file);
                                }}
                                disabled={uploadingLogo}
                              />
                            </label>
                            <p className="text-[10px] text-muted-foreground mt-1">PNG/JPG transparent background</p>
                          </div>
                        </div>
                      </div>

                      {/* School Details Inputs */}
                      <div className="space-y-4 pb-4 border-b border-slate-100">
                        <h4 className="text-slate-800 font-semibold text-sm">School Details (Back Side)</h4>
                        
                        <div className="space-y-1.5">
                          <Label htmlFor="school-address" className="text-slate-700 font-medium text-xs">School Address</Label>
                          <Input
                            id="school-address"
                            value={schoolAddress}
                            onChange={(e) => setSchoolAddress(e.target.value)}
                            className="border-slate-200 text-sm"
                            placeholder="123 Main St, City"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="school-phone" className="text-slate-700 font-medium text-xs">School Contact Phone</Label>
                          <Input
                            id="school-phone"
                            value={schoolPhone}
                            onChange={(e) => setSchoolPhone(e.target.value)}
                            className="border-slate-200 text-sm"
                            placeholder="+123456789"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="school-email" className="text-slate-700 font-medium text-xs">School Contact Email</Label>
                          <Input
                            id="school-email"
                            value={schoolEmail}
                            onChange={(e) => setSchoolEmail(e.target.value)}
                            className="border-slate-200 text-sm"
                            placeholder="info@school.com"
                          />
                        </div>
                      </div>

                      {/* Title input */}
                      <div className="space-y-1.5">
                        <Label htmlFor="card-title" className="text-slate-700 font-medium">Card Header Title</Label>
                        <Input
                          id="card-title"
                          value={settings?.card_title || ""}
                          onChange={(e) => setSettings(prev => prev ? { ...prev, card_title: e.target.value } : null)}
                          className="border-slate-200"
                        />
                      </div>

                      {/* Design theme selection */}
                      <div className="space-y-1.5">
                        <Label className="text-slate-700 font-medium">Design Style</Label>
                        <Select 
                          value={settings?.design_style || "modern"} 
                          onValueChange={(v) => setSettings(prev => prev ? { ...prev, design_style: v } : null)}
                        >
                          <SelectTrigger className="border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="modern">Modern (Glassmorphism & Gradients)</SelectItem>
                            <SelectItem value="classic">Classic (Header block & Clean grid)</SelectItem>
                            <SelectItem value="minimal">Minimal (Thin borders & Sleek spacing)</SelectItem>
                            <SelectItem value="playful">Playful (Yellow badge & Soft borders)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Orientation layout toggle */}
                      <div className="space-y-1.5">
                        <Label className="text-slate-700 font-medium">Layout Orientation</Label>
                        <Select 
                          value={settings?.card_layout || "vertical"} 
                          onValueChange={(v) => setSettings(prev => prev ? { ...prev, card_layout: v } : null)}
                        >
                          <SelectTrigger className="border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vertical">Vertical (Portrait)</SelectItem>
                            <SelectItem value="horizontal">Horizontal (Landscape)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Color Picker presets */}
                      <div className="space-y-3">
                        <Label className="text-slate-700 font-medium">Accent / Primary Color</Label>
                        <div className="flex flex-wrap gap-2">
                          {presetColors.map(color => (
                            <button
                              key={color}
                              className="w-8 h-8 rounded-full border border-slate-200 relative transition-transform hover:scale-110"
                              style={{ backgroundColor: color }}
                              onClick={() => setSettings(prev => prev ? { ...prev, primary_color: color } : null)}
                              title={color}
                            >
                              {settings?.primary_color === color && (
                                <Check className="absolute inset-0 m-auto h-4 w-4 text-white font-bold" />
                              )}
                            </button>
                          ))}
                        </div>
                        {/* Custom Hex selector */}
                        <div className="flex gap-2 items-center">
                          <Input
                            type="color"
                            className="w-10 h-10 p-0 border border-slate-200 rounded-md cursor-pointer shrink-0"
                            value={settings?.primary_color || "#1e40af"}
                            onChange={(e) => setSettings(prev => prev ? { ...prev, primary_color: e.target.value } : null)}
                          />
                          <Input
                            type="text"
                            className="border-slate-200 text-sm font-mono"
                            placeholder="#HEX"
                            value={settings?.primary_color || ""}
                            onChange={(e) => setSettings(prev => prev ? { ...prev, primary_color: e.target.value } : null)}
                          />
                        </div>
                      </div>

                      {/* Text Color Selection */}
                      <div className="space-y-1.5">
                        <Label className="text-slate-700 font-medium">Header Text Color</Label>
                        <Select 
                          value={settings?.text_color || "#ffffff"} 
                          onValueChange={(v) => setSettings(prev => prev ? { ...prev, text_color: v } : null)}
                        >
                          <SelectTrigger className="border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="#ffffff">White</SelectItem>
                            <SelectItem value="#000000">Black</SelectItem>
                            <SelectItem value="#f8fafc">Off-White</SelectItem>
                            <SelectItem value="#f1f5f9">Slate Light</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Display switches */}
                      <div className="space-y-4 pt-2 border-t border-slate-100">
                        <h4 className="text-slate-800 font-semibold text-sm">Visible Fields & Branding</h4>
                        
                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-logo" className="text-slate-600 font-normal">Show School Logo</Label>
                          <Switch 
                            id="show-logo"
                            checked={settings?.show_logo}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_logo: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-qr" className="text-slate-600 font-normal">Show Student QR Code</Label>
                          <Switch 
                            id="show-qr"
                            checked={settings?.show_qr_code}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_qr_code: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-roll" className="text-slate-600 font-normal">Show Roll Number</Label>
                          <Switch 
                            id="show-roll"
                            checked={settings?.show_roll_number}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_roll_number: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-class" className="text-slate-600 font-normal">Show Class & Section</Label>
                          <Switch 
                            id="show-class"
                            checked={settings?.show_class}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_class: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-dob" className="text-slate-600 font-normal">Show Date of Birth</Label>
                          <Switch 
                            id="show-dob"
                            checked={settings?.show_dob}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_dob: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-blood" className="text-slate-600 font-normal">Show Blood Group</Label>
                          <Switch 
                            id="show-blood"
                            checked={settings?.show_blood_group}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_blood_group: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-emergency" className="text-slate-600 font-normal">Show Emergency Contact</Label>
                          <Switch 
                            id="show-emergency"
                            checked={settings?.show_emergency_contact}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_emergency_contact: v } : null)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="show-sig" className="text-slate-600 font-normal">Authorized Signature Line</Label>
                          <Switch 
                            id="show-sig"
                            checked={settings?.show_signature}
                            onCheckedChange={(v) => setSettings(prev => prev ? { ...prev, show_signature: v } : null)}
                          />
                        </div>

                        {settings?.show_signature && (
                          <div className="space-y-1.5 pl-4 border-l-2 border-slate-100">
                            <Label htmlFor="sig-text" className="text-slate-700 font-medium text-xs">Signature Text Label</Label>
                            <Input
                              id="sig-text"
                              value={settings?.signature_text || ""}
                              onChange={(e) => setSettings(prev => prev ? { ...prev, signature_text: e.target.value } : null)}
                              className="border-slate-200 text-sm h-8"
                            />
                          </div>
                        )}
                      </div>

                      {/* Save Button */}
                      <Button 
                        onClick={() => settings && saveSettings(settings)}
                        disabled={savingSettings}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
                      >
                        {savingSettings ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving Settings...
                          </>
                        ) : "Save & Sync Configuration"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Live Card Preview Box */}
                <div className="lg:col-span-7 flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl min-h-[500px] w-full">
                  <h3 className="text-slate-900 font-bold mb-6 text-sm flex items-center gap-1.5 uppercase tracking-wider">
                    <Sliders className="h-4 w-4 text-blue-600" />
                    Live Layout Preview (Double-Sided)
                  </h3>
                  
                  {/* High Fidelity Card Preview Container */}
                  <div className={`flex flex-row flex-wrap justify-center items-center gap-6 w-full ${settings?.card_layout === 'horizontal' ? 'flex-col' : ''}`}>
                    {/* FRONT SIDE */}
                    <IDCard 
                      student={{ first_name: "John", last_name: "Doe", registration_number: "REG-992381", emergency_contact: "123-456-789" }}
                      settings={settings}
                      schoolName={schoolName}
                      schoolLogo={schoolLogo}
                      schoolAddress={schoolAddress}
                      schoolPhone={schoolPhone}
                      schoolEmail={schoolEmail}
                      side="front"
                    />

                    {/* BACK SIDE */}
                    <IDCard 
                      student={{ id: "john-doe" }}
                      settings={settings}
                      schoolName={schoolName}
                      schoolLogo={schoolLogo}
                      schoolAddress={schoolAddress}
                      schoolPhone={schoolPhone}
                      schoolEmail={schoolEmail}
                      side="back"
                    />
                  </div>
                </div>
              </div>

            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Edit Student Details Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md bg-white border border-blue-100 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-blue-900 font-bold flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Edit Student ID Details
            </DialogTitle>
            <DialogDescription>
              Modify name, photo, blood group, roll number, and card validity.
            </DialogDescription>
          </DialogHeader>

          {editingStudent && (
            <div className="space-y-4 my-2">
              
              {/* Photo Upload selector */}
              <div className="flex justify-center items-center gap-4 border border-dashed border-blue-100 p-4 rounded-xl">
                <div className="w-20 h-20 rounded-full border border-slate-100 overflow-hidden flex items-center justify-center bg-slate-50 shrink-0">
                  {editingStudent.profile_image_url && !editPhotoError ? (
                    <img 
                      src={editingStudent.profile_image_url} 
                      alt="Photo" 
                      className="w-full h-full object-cover" 
                      onError={() => setEditPhotoError(true)}
                    />
                  ) : (
                    <User className="h-10 w-10 text-slate-300" />
                  )}
                </div>
                
                <div className="flex flex-col gap-2">
                  <Label className="text-slate-700 font-medium">Student Photo</Label>
                  <label className="cursor-pointer">
                    <span className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5">
                      {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Upload New Image
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handlePhotoUpload(file);
                      }}
                      disabled={uploadingPhoto}
                    />
                  </label>
                </div>
              </div>

              {/* Names input */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First Name</Label>
                  <Input
                    value={editingStudent.first_name}
                    onChange={(e) => setEditingStudent({ ...editingStudent, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name</Label>
                  <Input
                    value={editingStudent.last_name || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, last_name: e.target.value })}
                  />
                </div>
              </div>

              {/* Identifiers input */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Roll Number</Label>
                  <Input
                    value={editingStudent.roll_number || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, roll_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Registration Number</Label>
                  <Input
                    value={editingStudent.registration_number || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, registration_number: e.target.value })}
                  />
                </div>
              </div>

              {/* D.O.B and Blood Group */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={editingStudent.date_of_birth || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, date_of_birth: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Blood Group</Label>
                  <Select 
                    value={editingStudent.blood_group || "—"} 
                    onValueChange={(v) => setEditingStudent({ ...editingStudent, blood_group: v === "—" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="—">—</SelectItem>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A-">A-</SelectItem>
                      <SelectItem value="B+">B+</SelectItem>
                      <SelectItem value="B-">B-</SelectItem>
                      <SelectItem value="AB+">AB+</SelectItem>
                      <SelectItem value="AB-">AB-</SelectItem>
                      <SelectItem value="O+">O+</SelectItem>
                      <SelectItem value="O-">O-</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Emergency Contact & Validity */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Emergency Phone</Label>
                  <Input
                    placeholder="Emergency Contact"
                    value={editingStudent.emergency_contact || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, emergency_contact: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Validity Date</Label>
                  <Input
                    placeholder="e.g. 2027-06-30"
                    type="date"
                    value={editingStudent.card_valid_until || ""}
                    onChange={(e) => setEditingStudent({ ...editingStudent, card_valid_until: e.target.value })}
                  />
                </div>
              </div>

            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={saveStudentDetails}
              disabled={savingStudent}
            >
              {savingStudent ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Student Card Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md bg-white border border-blue-100 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-blue-900 font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Create Student ID Card
            </DialogTitle>
            <DialogDescription>
              Enter student details to add them to the directory and generate their card automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {/* Name inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input
                  placeholder="First name"
                  value={newStudent.first_name}
                  onChange={(e) => setNewStudent({ ...newStudent, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input
                  placeholder="Last name"
                  value={newStudent.last_name}
                  onChange={(e) => setNewStudent({ ...newStudent, last_name: e.target.value })}
                />
              </div>
            </div>

            {/* Identifiers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Roll Number</Label>
                <Input
                  placeholder="Roll number"
                  value={newStudent.roll_number}
                  onChange={(e) => setNewStudent({ ...newStudent, roll_number: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Registration Number</Label>
                <Input
                  placeholder="Reg number"
                  value={newStudent.registration_number}
                  onChange={(e) => setNewStudent({ ...newStudent, registration_number: e.target.value })}
                />
              </div>
            </div>

            {/* Class & Section select */}
            <div className="space-y-1.5">
              <Label>Class & Section</Label>
              <Select 
                value={newStudent.class_section_id || "__none"} 
                onValueChange={(v) => setNewStudent({ ...newStudent, class_section_id: v === "__none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No enrollment / Class section</SelectItem>
                  {sections.map(s => {
                    const clsObj = classes.find(c => c.id === s.class_id);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {clsObj?.name || ""} - {s.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* D.O.B and Blood Group */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={newStudent.date_of_birth}
                  onChange={(e) => setNewStudent({ ...newStudent, date_of_birth: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Blood Group</Label>
                <Select 
                  value={newStudent.blood_group || "—"} 
                  onValueChange={(v) => setNewStudent({ ...newStudent, blood_group: v === "—" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="—">—</SelectItem>
                    <SelectItem value="A+">A+</SelectItem>
                    <SelectItem value="A-">A-</SelectItem>
                    <SelectItem value="B+">B+</SelectItem>
                    <SelectItem value="B-">B-</SelectItem>
                    <SelectItem value="AB+">AB+</SelectItem>
                    <SelectItem value="AB-">AB-</SelectItem>
                    <SelectItem value="O+">O+</SelectItem>
                    <SelectItem value="O-">O-</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Emergency Contact & Validity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Emergency Phone</Label>
                <Input
                  placeholder="Emergency phone"
                  value={newStudent.emergency_contact}
                  onChange={(e) => setNewStudent({ ...newStudent, emergency_contact: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validity Date</Label>
                <Input
                  type="date"
                  value={newStudent.card_valid_until}
                  onChange={(e) => setNewStudent({ ...newStudent, card_valid_until: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={handleCreateStudent}
              disabled={creatingStudent}
            >
              {creatingStudent ? "Creating..." : "Create Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Creation Download/Export Dialog */}
      <Dialog open={isCreatedSuccessOpen} onOpenChange={setIsCreatedSuccessOpen}>
        <DialogContent className="max-w-md bg-white border border-blue-100 rounded-2xl p-6 text-center">
          <DialogHeader>
            <DialogTitle className="text-blue-900 font-bold flex items-center justify-center gap-2">
              <Check className="h-6 w-6 text-blue-600 bg-blue-50 rounded-full p-0.5" />
              Student Card Created!
            </DialogTitle>
          </DialogHeader>

          <div className="my-4 space-y-3">
            <p className="text-slate-600 text-sm">
              The student record and card details have been successfully created under saved global settings.
            </p>
            {createdStudentForCard && (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-medium text-slate-800 text-sm">
                {createdStudentForCard.first_name} {createdStudentForCard.last_name || ""}
                {createdStudentForCard.registration_number && (
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{createdStudentForCard.registration_number}</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-center sm:justify-center gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setIsCreatedSuccessOpen(false)} className="w-full">
              Close
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              onClick={() => {
                if (createdStudentForCard) {
                  void printStudentCards(
                    supabase,
                    schoolId!,
                    [createdStudentForCard],
                    schoolLogo,
                    schoolName
                  );
                }
              }}
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Download & Export Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Preview Modal */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-3xl bg-white border border-blue-100 rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-blue-900 font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              Student ID Card Preview (Double-Sided)
            </DialogTitle>
            <DialogDescription>
              Previewing both front and back sides of the card with dynamic branding colors.
            </DialogDescription>
          </DialogHeader>

          {previewStudent && (
            <div className="flex flex-col md:flex-row justify-center items-center gap-8 py-6 bg-slate-50 border border-slate-200 rounded-2xl overflow-auto max-h-[70vh] w-full">
              {/* FRONT SIDE */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Front Side</span>
                <IDCard 
                  student={previewStudent}
                  settings={settings}
                  schoolName={schoolName}
                  schoolLogo={schoolLogo}
                  schoolAddress={schoolAddress}
                  schoolPhone={schoolPhone}
                  schoolEmail={schoolEmail}
                  side="front"
                />
              </div>

              {/* BACK SIDE */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Back Side</span>
                <IDCard 
                  student={previewStudent}
                  settings={settings}
                  schoolName={schoolName}
                  schoolLogo={schoolLogo}
                  schoolAddress={schoolAddress}
                  schoolPhone={schoolPhone}
                  schoolEmail={schoolEmail}
                  side="back"
                />
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)}>
              Close
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              onClick={() => {
                if (previewStudent) {
                  void printStudentCards(
                    supabase,
                    schoolId!,
                    [previewStudent],
                    schoolLogo,
                    schoolName
                  );
                }
              }}
            >
              <Printer className="h-4 w-4" />
              Print Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
