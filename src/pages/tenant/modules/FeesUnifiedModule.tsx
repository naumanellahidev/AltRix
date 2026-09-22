/**
 * Kept so every shell that imports this path keeps working.
 *
 * The Fees Centre now lives in `./fees/FeesCentreModule`, which also
 * understands this module's old deep links (`?tab=plans|advanced|vouchers`)
 * and sends them to the tab that owns that job.
 */
export { default } from "@/pages/tenant/modules/fees/FeesCentreModule";
