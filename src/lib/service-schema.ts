import { z } from "zod";

/** Shared validation for admin service create/update payloads. */
export const serviceSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).nullable().optional(),
    duration_min: z.number().int().min(5).max(600),
    price_cents: z.number().int().min(0).max(1_000_000),
    deposit_cents: z.number().int().min(0).max(1_000_000),
    buffer_before_min: z.number().int().min(0).max(120),
    buffer_after_min: z.number().int().min(0).max(120),
    active: z.union([z.literal(0), z.literal(1)]),
  })
  .refine((s) => s.deposit_cents <= s.price_cents, {
    message: "Deposit cannot exceed price",
    path: ["deposit_cents"],
  });
