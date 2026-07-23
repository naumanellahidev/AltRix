/**
 * Internationalization & Localization Utility for AltRix School ERP (English & Urdu RTL support).
 */

export type Language = "en" | "ur";

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    "nav.dashboard": "Dashboard Overview",
    "nav.academics": "Academics",
    "nav.attendance": "Attendance Heatmap",
    "nav.exams": "Exams & Grading",
    "nav.finance": "Finance & Fees",
    "nav.transport": "Transport Management",
    "nav.library": "Library Center",
    "nav.wellbeing": "Student Health & Infirmary",
    "nav.inventory": "Asset & Inventory",
    "nav.alumni": "Alumni Network",
    "nav.hostel": "Hostel & Boarding",
    "btn.save": "Save Changes",
    "btn.cancel": "Cancel",
    "btn.submit": "Submit Application",
    "btn.issue": "Issue Loan / Asset",
  },
  ur: {
    "nav.dashboard": "ڈیش بورڈ جائزہ",
    "nav.academics": "تعلیمی نظام",
    "nav.attendance": "حاضری ہاٹ میپ",
    "nav.exams": "امتحانات اور گریڈنگ",
    "nav.finance": "مالیات اور فیس",
    "nav.transport": "ٹرانسپورٹ اور بس ٹریکنگ",
    "nav.library": "لائبریری سینٹر",
    "nav.wellbeing": "طالب علم کی صحت اور ڈسپنسری",
    "nav.inventory": "اثاثہ جات اور انوینٹری",
    "nav.alumni": "ایلومینائی نیٹ ورک",
    "nav.hostel": "ہاسٹل اور بورڈنگ",
    "btn.save": "تبدیلیاں محفوظ کریں",
    "btn.cancel": "منسوخ کریں",
    "btn.submit": "درخواست جمع کریں",
    "btn.issue": "جاری کریں",
  },
};

export function t(key: string, lang: Language = "en"): string {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
}

export function getDirection(lang: Language = "en"): "ltr" | "rtl" {
  return lang === "ur" ? "rtl" : "ltr";
}
