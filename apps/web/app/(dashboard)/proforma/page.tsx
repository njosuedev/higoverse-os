import { redirect } from "next/navigation";

// Proforma lives in Sales now (Sales → Proforma tab); old links land there.
export default function ProformaPage() {
  redirect("/sales?tab=proforma");
}
