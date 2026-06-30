"use client";

/**
 * Staff manager. Edits a practitioner's profile, which services they can
 * perform, and their weekly availability -- all writing to the same tables
 * (staff, staff_services, availability_blocks) the customer slot engine
 * reads. Remove a block or a capability here and those slots stop being
 * offered on the next availability query.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Service } from "@/lib/types";
import type { AvailabilityBlock, StaffDetail } from "@/lib/admin-repo";

const WEEKDAYS = [
  { idx: 0, label: "Sun" },
  { idx: 1, label: "Mon" },
  { idx: 2, label: "Tue" },
  { idx: 3, label: "Wed" },
  { idx: 4, label: "Thu" },
  { idx: 5, label: "Fri" },
  { idx: 6, label: "Sat" },
];

const minToHHmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

interface BlockRow {
  weekday: number;
  start: string; // HH:mm
  end: string; // HH:mm
}

interface FormState {
  name: string;
  title: string;
  color: string;
  active: boolean;
  serviceIds: number[];
  blocks: BlockRow[];
}

function toForm(s: StaffDetail): FormState {
  return {
    name: s.name,
    title: s.title ?? "",
    color: s.color,
    active: s.active === 1,
    serviceIds: [...s.service_ids],
    blocks: s.availability.map((b) => ({
      weekday: b.weekday,
      start: minToHHmm(b.start_min),
      end: minToHHmm(b.end_min),
    })),
  };
}

export function StaffClient({
  staff,
  services,
}: {
  staff: StaffDetail[];
  services: Service[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(s: StaffDetail) {
    setEditingId(s.id);
    setForm(toForm(s));
    setError(null);
  }

  function addBlock(weekday: number) {
    if (!form) return;
    setForm({
      ...form,
      blocks: [...form.blocks, { weekday, start: "09:00", end: "17:00" }],
    });
  }
  function removeBlock(i: number) {
    if (!form) return;
    setForm({ ...form, blocks: form.blocks.filter((_, idx) => idx !== i) });
  }
  function setBlock(i: number, patch: Partial<BlockRow>) {
    if (!form) return;
    setForm({
      ...form,
      blocks: form.blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    });
  }
  function toggleService(id: number) {
    if (!form) return;
    setForm({
      ...form,
      serviceIds: form.serviceIds.includes(id)
        ? form.serviceIds.filter((x) => x !== id)
        : [...form.serviceIds, id],
    });
  }

  async function save() {
    if (!form || editingId === null) return;
    setSaving(true);
    setError(null);
    const availability: AvailabilityBlock[] = form.blocks.map((b) => ({
      weekday: b.weekday,
      start_min: hhmmToMin(b.start),
      end_min: hhmmToMin(b.end),
    }));
    if (availability.some((b) => b.end_min <= b.start_min)) {
      setError("Each availability block must end after it starts.");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/staff/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          title: form.title.trim() || null,
          color: form.color,
          active: form.active ? 1 : 0,
          serviceIds: form.serviceIds,
          availability,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Save failed.");
        setSaving(false);
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Staff &amp; availability
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who works, what they do, and when. Changes drive the booking
          calendar.
        </p>
      </div>

      <div className="space-y-2">
        {staff.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 ${
              s.active ? "" : "opacity-60"
            }`}
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-warmwhite"
              style={{ backgroundColor: s.color }}
            >
              {s.name.split(" ").map((p) => p[0]).join("")}
            </span>
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
                {s.title ?? "Practitioner"} -- {s.service_ids.length} service
                {s.service_ids.length !== 1 ? "s" : ""} --{" "}
                {s.availability.length} availability block
                {s.availability.length !== 1 ? "s" : ""}
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

      {form && editingId !== null && (
        <div className="rounded-xl border border-slatewell/30 bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Edit {form.name}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Title">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Calendar color">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-16 cursor-pointer rounded-md border border-input bg-card"
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
                Accepting bookings
              </label>
            </Field>
          </div>

          {/* Capabilities */}
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">Services performed</p>
            <div className="flex flex-wrap gap-2">
              {services.map((sv) => {
                const on = form.serviceIds.includes(sv.id);
                return (
                  <button
                    key={sv.id}
                    type="button"
                    onClick={() => toggleService(sv.id)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      on
                        ? "border-slatewell bg-slatewell text-warmwhite"
                        : "border-border bg-card text-muted-foreground hover:border-slatewell"
                    }`}
                  >
                    {sv.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Weekly availability */}
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">Weekly availability</p>
            <div className="space-y-3">
              {WEEKDAYS.map((wd) => {
                const dayBlocks = form.blocks
                  .map((b, i) => ({ b, i }))
                  .filter(({ b }) => b.weekday === wd.idx);
                return (
                  <div
                    key={wd.idx}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{wd.label}</span>
                      <button
                        type="button"
                        onClick={() => addBlock(wd.idx)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slatewell hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Add hours
                      </button>
                    </div>
                    {dayBlocks.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">Off</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {dayBlocks.map(({ b, i }) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={b.start}
                              onChange={(e) =>
                                setBlock(i, { start: e.target.value })
                              }
                              className="rounded-md border border-input bg-card px-2 py-1 text-sm"
                            />
                            <span className="text-muted-foreground">to</span>
                            <input
                              type="time"
                              value={b.end}
                              onChange={(e) =>
                                setBlock(i, { end: e.target.value })
                              }
                              className="rounded-md border border-input bg-card px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeBlock(i)}
                              aria-label="Remove block"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
              {saving ? "Saving..." : "Save staff member"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditingId(null)}
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
