// Row shapes mirror the SQLite schema (snake_case, no ORM).

export interface Business {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  hours_note: string | null;
  cancellation_window_hours: number;
  cancellation_policy: string | null;
  deposit_policy: string | null;
}

export interface Service {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  duration_min: number;
  price_cents: number;
  deposit_cents: number;
  buffer_before_min: number;
  buffer_after_min: number;
  active: number;
  sort_order: number;
}

export interface Staff {
  id: number;
  business_id: number;
  name: string;
  title: string | null;
  color: string;
  active: number;
  sort_order: number;
}

export interface Customer {
  id: number;
  business_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  tags: string;
  created_at: string;
}

export type BookingStatus = "Confirmed" | "Cancelled" | "Completed" | "No-Show";
export type DepositStatus = "Held" | "Captured" | "Released" | "Refunded";

export interface Booking {
  id: string;
  business_id: number;
  customer_id: number;
  service_id: number;
  staff_id: number;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  price_cents: number;
  deposit_cents: number;
  deposit_status: DepositStatus | null;
  stripe_payment_intent_id: string | null;
  cancel_token: string;
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}
