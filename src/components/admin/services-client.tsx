"use client";

/**
 * Services manager. Lists every service (active + inactive) and edits or
 * creates them against /api/admin/services. These rows are the same ones
 * the customer wizard offers, so a price, deposit, duration, buffer, or
 * active-flag change here changes what customers see and book.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { formatDuration, formatMoney } from "@/lib/format";
import type { Service } from "@/lib/types";

interface FormState {
  name: string;
  description: string;
  duration_min: string;
  price: string; // dollars
  deposit: string; // dollars
  buffer_before_min: string;
  buffer_after_min: string;
  active: boolean;
}

function toForm(s?: Service): FormState {
  return {
    name: s?.name ?? "",
    description: s?.description ?? "",
    duration_min: String(s?.duration_min ?? 60),
    price: s ? (s.price_cents / 100).toString() : "",
    deposit: s ? (s.deposit_cents / 100).toString() : "0",
    buffer_before_min: String(s?.buffer_before_min ?? 0),
    buffer_after_min: String(s?.buffer_after_min ?? 0),
    active: s ? s.active === 1 : true,
  };
}

export function ServicesClient({ services }: { services: Service[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [form, setForm] = useState<FormState>(toForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(target: Service | "new") {
    setEditing(target);
    setForm(toForm(target === "new" ? undefined : target));
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const dollarsToCents = (v: string) => Math.round(parseFloat(v || "0") * 100);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_min: parseInt(form.duration_min || "0", 10),
      price_cents: dollarsToCents(form.price),
      deposit_cents: dollarsToCents(form.deposit),
      buffer_before_min: parseInt(form.buffer_before_min || "0", 10),
      buffer_after_min: parseInt(form.buffer_after_min || "0", 10),
      active: form.active ? 1 : 0,
    };
    const isNew = editing === "new";
    try {
      const res = await fetch(
        isNew ? "/api/admin/services" : `/api/admin/services/${(editing as Service).id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed.");
        setSaving(false);
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Services
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What customers can book. Edits apply to the booking flow
            immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("new")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slatewell px-3 py-2 text-sm font-medium text-warmwhite hover:bg-slatewell/90"
        >
          <Plus className="h-4 w-4" /> Add service
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {services.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-center gap-4 px-4 py-3 ${
              i < services.length - 1 ? "border-b border-border" : ""
            } ${s.active ? "" : "opacity-60"}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">
                  {s.name}
                </span>
                {s.active === 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    Inactive
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDuration(s.duration_min)}
                {(s.buffer_before_min > 0 || s.buffer_after_min > 0) &&
                  ` -- ${s.buffer_before_min}/${s.buffer_after_min} min buffer`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-foreground">
                {formatMoney(s.price_cents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.deposit_cents > 0
                  ? `${formatMoney(s.deposit_cents)} deposit`
                  : "no deposit"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => open(s)}
              aria-label={`Edit ${s.name}`}
              className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="rounded-xl border border-slatewell/30 bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            {editing === "new" ? "New service" : `Edit ${(editing as Service).name}`}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className={inputCls}
              />
            </Field>
            <Field label="Duration (min)">
              <input
                type="number"
                value={form.duration_min}
                onChange={(e) =>
                  setForm({ ...form, duration_min: e.target.value })
                }
                className={inputCls}
              />
            </Field>
            <Field label="Price ($)">
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Deposit ($)">
              <input
                type="number"
                step="0.01"
                value={form.deposit}
                onChange={(e) => setForm({ ...form, deposit: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Active">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                Bookable
              </label>
            </Field>
            <Field label="Buffer before (min)">
              <input
                type="number"
                value={form.buffer_before_min}
                onChange={(e) =>
                  setForm({ ...form, buffer_before_min: e.target.value })
                }
                className={inputCls}
              />
            </Field>
            <Field label="Buffer after (min)">
              <input
                type="number"
                value={form.buffer_after_min}
                onChange={(e) =>
                  setForm({ ...form, buffer_after_min: e.target.value })
                }
                className={inputCls}
              />
            </Field>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-terracotta/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-lg bg-slatewell px-5 py-2.5 text-sm font-medium text-warmwhite hover:bg-slatewell/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save service"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(null)}
              className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
