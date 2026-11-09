import { saleRequest } from "@/lib/sale-api";

// Car rentals (sale-service routes/rentals.py): active → returned or cancelled.
export type RentalStatus = "active" | "returned" | "cancelled";

export interface Rental {
  id: string;
  rental_no: string;
  customer_id?: string | null;
  customer: string;
  customer_phone: string;
  customer_id_no: string;
  customer_address: string;
  product_id?: string | null;
  car_name: string;
  car_type: string;
  plate_no: string;
  chassis_no: string;
  start_date: string;
  end_date: string;
  agreement_date: string;
  rent_amount: number;
  deposit: number;
  currency: string;
  notes: string;
  status: RentalStatus;
  returned_at?: string | null;
  deposit_returned?: number | null;
  return_note: string;
  created_by_name: string;
  created_at?: string | null;
}

export type RentalInput = Omit<Rental, "id" | "rental_no" | "status" | "returned_at" | "deposit_returned" | "return_note" | "created_by_name" | "created_at">;

/** Roles that may delete a rental (MANAGER_ROLES in sale-service). */
export const RENTAL_MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

export async function listRentals(status?: RentalStatus | ""): Promise<Rental[]> {
  const res = await saleRequest(`/rentals${status ? `?status=${status}` : ""}`);
  return (res?.data as Rental[]) ?? [];
}
export async function saveRental(input: RentalInput, id?: string): Promise<Rental> {
  const res = await saleRequest(id ? `/rentals/${id}` : "/rentals", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
  return res?.data as Rental;
}
export async function returnRental(id: string, depositReturned: number, note: string): Promise<Rental> {
  const res = await saleRequest(`/rentals/${id}/return`, { method: "POST", body: JSON.stringify({ deposit_returned: depositReturned, return_note: note || null }) });
  return res?.data as Rental;
}
export async function cancelRental(id: string): Promise<Rental> {
  const res = await saleRequest(`/rentals/${id}/cancel`, { method: "POST" });
  return res?.data as Rental;
}
export async function deleteRental(id: string): Promise<void> {
  await saleRequest(`/rentals/${id}`, { method: "DELETE" });
}
