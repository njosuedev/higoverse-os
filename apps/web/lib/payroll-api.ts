import { expenseRequest } from "@/lib/expense-api";

// Monthly salaries (expense-service /payroll): the manager's employee list,
// each month's payments, and what's still due.

export const PAYROLL_ROLES = ["owner", "admin", "manager", "accountant"];
export const PAY_METHODS = ["cash", "mtn", "airtel", "bank"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export interface Employee {
  id: string;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  position: string | null;
  monthly_salary: number;
  start_date: string | null;
  left_on: string | null;
  active: boolean;
  notes: string | null;
}

export type EmployeeInput = Omit<Employee, "id" | "active">;

export interface SalaryPayment {
  id: string;
  employee_id: string;
  period: string;            // "2026-10"
  employee_name: string;
  employee_id_number: string | null;
  position: string | null;
  gross: number;
  deductions: number;
  deduction_note: string | null;
  net: number;
  paid_on: string;
  method: PayMethod;
  reference: string | null;
  expense_id: string | null;
  paid_by_name: string | null;
  created_at: string | null;
}

/** Part of a salary paid early; the next salary payment deducts it (payment_id). */
export interface SalaryAdvance {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_id_number: string | null;
  position: string | null;
  amount: number;
  given_on: string;
  method: PayMethod;
  reference: string | null;
  note: string | null;
  payment_id: string | null;
  given_by_name: string | null;
  created_at: string | null;
}

export interface AdvanceInput {
  employee_id: string;
  amount: number;
  given_on: string;
  method: PayMethod;
  reference: string | null;
  note: string | null;
}

/** Days marked present, absent, late and on leave in a period. */
export interface AttendanceCounts { present: number; absent: number; late: number; leave: number }

/** `advances`: given and not yet deducted from a salary. `attendance`: the
 *  month's marks (shown beside the salary, never deducted by themselves). */
export interface MonthRow { employee: Employee | null; payment: SalaryPayment | null; advances: SalaryAdvance[]; attendance?: AttendanceCounts }

export interface Month {
  period: string;
  rows: MonthRow[];
  totals: {
    employees: number; paid_count: number; paid_net: number; paid_gross: number; due_count: number; due_gross: number;
    advances_outstanding: number;
  };
}

export interface PaymentInput {
  employee_id: string;
  period: string;
  gross: number;
  /** Other deductions; outstanding advances are deducted by the server. */
  deductions: number;
  deduction_note: string | null;
  paid_on: string;
  method: PayMethod;
  reference: string | null;
}

export const listEmployees = async (): Promise<Employee[]> => (await expenseRequest("/payroll/employees"))?.data ?? [];
export const addEmployee = async (e: EmployeeInput): Promise<Employee> =>
  (await expenseRequest("/payroll/employees", { method: "POST", body: JSON.stringify(e) }))?.data;
export const updateEmployee = async (id: string, e: EmployeeInput): Promise<Employee> =>
  (await expenseRequest(`/payroll/employees/${id}`, { method: "PUT", body: JSON.stringify(e) }))?.data;
export const deleteEmployee = async (id: string) => expenseRequest(`/payroll/employees/${id}`, { method: "DELETE" });
export const getMonth = async (period: string): Promise<Month | null> => (await expenseRequest(`/payroll/months/${period}`))?.data ?? null;
export const recordPayment = async (p: PaymentInput): Promise<SalaryPayment> =>
  (await expenseRequest("/payroll/payments", { method: "POST", body: JSON.stringify(p) }))?.data;
export const undoPayment = async (id: string) => expenseRequest(`/payroll/payments/${id}`, { method: "DELETE" });
export const giveAdvance = async (a: AdvanceInput): Promise<SalaryAdvance> =>
  (await expenseRequest("/payroll/advances", { method: "POST", body: JSON.stringify(a) }))?.data;
export const removeAdvance = async (id: string) => expenseRequest(`/payroll/advances/${id}`, { method: "DELETE" });

// ── Attendance: each day, who came (present / absent / late / on leave) ──
export const ATTENDANCE = ["present", "absent", "late", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE)[number];
export interface AttendanceMark { status: AttendanceStatus; note: string | null; marked_by_name: string | null; updated_at: string | null }
export interface AttendanceDay { day: string; today: string; rows: { employee: Employee; mark: AttendanceMark | null }[] }
export interface AttendanceMonth {
  period: string; first: string; last: string; today: string;
  rows: { employee: Employee; counts: AttendanceCounts; days: Record<string, AttendanceStatus> }[];
}
export const getAttendanceDay = async (day: string): Promise<AttendanceDay | null> =>
  (await expenseRequest(`/payroll/attendance/day/${day}`))?.data ?? null;
/** Marks for one day; `status: null` clears a person's mark. Returns the day as saved. */
export const markAttendance = async (day: string, marks: { employee_id: string; status: AttendanceStatus | null; note?: string | null }[]): Promise<AttendanceDay | null> =>
  (await expenseRequest(`/payroll/attendance/day/${day}`, { method: "PUT", body: JSON.stringify({ marks }) }))?.data ?? null;
export const getAttendanceMonth = async (period: string): Promise<AttendanceMonth | null> =>
  (await expenseRequest(`/payroll/attendance/month/${period}`))?.data ?? null;

/** The server's reason for refusing (its `detail`), or null. */
export function payrollError(err: unknown): string | null {
  const m = /Expense API error: \d+ ([\s\S]*)$/.exec(err instanceof Error ? err.message : "");
  if (!m) return null;
  try {
    const d = JSON.parse(m[1])?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, "");
  } catch { /* not JSON */ }
  return null;
}

/** "2026-10" for a date. */
export const periodOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The month before / after `period`. */
export function shiftPeriod(period: string, by: number): string {
  const [y, m] = period.split("-").map(Number);
  return periodOf(new Date(y, m - 1 + by, 1));
}
