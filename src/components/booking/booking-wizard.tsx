"use client";

/**
 * Customer booking wizard: service -> staff -> date + time -> details ->
 * review/confirm. Single client component; availability is fetched from
 * /api/book/[slug]/availability as the customer picks a date.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatMoney,
  formatTime,
} from "@/lib/format";
import type { Service, Staff } from "@/lib/types";

const STEPS = ["Service", "Staff", "Time", "Details", "Review"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

interface SlotOption {
  time: string;
  staffId: number;
}

interface CustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
}

export function BookingWizard({
  slug,
  services,
  staffByService,
  weekdaysByStaff,
}: {
  slug: string;
  services: Service[];
  staffByService: Record<number, Staff[]>;
  weekdaysByStaff: Record<number, number[]>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);
  const [service, setService] = useState<Service | null>(null);
  const [staffChoice, setStaffChoice] = useState<number | "any" | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [form, setForm] = useState<CustomerForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const goTo = useCallback((next: StepIndex) => {
    setStep(next);
    setError(null);
    // Move focus to the step heading for keyboard/screen-reader users.
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  const capableStaff = service ? staffByService[service.id] ?? [] : [];

  // Weekdays with any availability for the current staff selection.
  const enabledWeekdays = useMemo(() => {
    const ids =
      staffChoice === "any" || staffChoice === null
        ? capableStaff.map((s) => s.id)
        : [staffChoice];
    const set = new Set<number>();
    ids.forEach((id) => (weekdaysByStaff[id] ?? []).forEach((w) => set.add(w)));
    return set;
  }, [staffChoice, capableStaff, weekdaysByStaff]);

  async function submit() {
    if (!service || !slot || !date) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          staffId: slot.staffId,
          date,
          time: slot.time,
          customer: {
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email,
            phone: form.phone,
          },
          notes: form.notes || undefined,
        }),
      });
      if (res.status === 201) {
        const { id } = await res.json();
        router.push(`/book/${slug}/confirmation/${id}`);
        return;
      }
      if (res.status === 409) {
        setSlot(null);
        goTo(2);
        setError(
          "That time was just taken. Here are the latest openings."
        );
        return;
      }
      setError("Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <StepIndicator current={step} />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-terracotta/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          {error}
        </p>
      )}

      {step === 0 && (
        <StepShell headingRef={headingRef} title="Choose a service">
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setService(s);
                    setStaffChoice(null);
                    setDate(null);
                    setSlot(null);
                    goTo(1);
                  }}
                  className="flex w-full items-baseline justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-slatewell focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span>
                    <span className="block font-medium">{s.name}</span>
                    {s.description && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {s.description}
                      </span>
                    )}
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {formatDuration(s.duration_min)}
                      {s.deposit_cents > 0 &&
                        ` · ${formatMoney(s.deposit_cents)} deposit`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">
                    {formatMoney(s.price_cents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </StepShell>
      )}

      {step === 1 && service && (
        <StepShell
          headingRef={headingRef}
          title="Choose your practitioner"
          onBack={() => goTo(0)}
        >
          <ul className="space-y-2">
            <li>
              <ChoiceButton
                onClick={() => {
                  setStaffChoice("any");
                  setDate(null);
                  setSlot(null);
                  goTo(2);
                }}
              >
                <span className="block font-medium">First available</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  We&apos;ll match you with the first open practitioner.
                </span>
              </ChoiceButton>
            </li>
            {capableStaff.map((member) => (
              <li key={member.id}>
                <ChoiceButton
                  onClick={() => {
                    setStaffChoice(member.id);
                    setDate(null);
                    setSlot(null);
                    goTo(2);
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-warmwhite"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </span>
                    <span>
                      <span className="block font-medium">{member.name}</span>
                      {member.title && (
                        <span className="block text-sm text-muted-foreground">
                          {member.title}
                        </span>
                      )}
                    </span>
                  </span>
                </ChoiceButton>
              </li>
            ))}
          </ul>
        </StepShell>
      )}

      {step === 2 && service && staffChoice !== null && (
        <DateTimeStep
          headingRef={headingRef}
          slug={slug}
          service={service}
          staffChoice={staffChoice}
          enabledWeekdays={enabledWeekdays}
          date={date}
          onBack={() => goTo(1)}
          onPickDate={(d) => {
            setDate(d);
            setSlot(null);
          }}
          onPickSlot={(s) => {
            setSlot(s);
            goTo(3);
          }}
        />
      )}

      {step === 3 && (
        <StepShell
          headingRef={headingRef}
          title="Your details"
          onBack={() => goTo(2)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              goTo(4);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                name="firstName"
                autoComplete="given-name"
                required
                value={form.firstName}
                onChange={(v) => setForm({ ...form, firstName: v })}
              />
              <Field
                label="Last name"
                name="lastName"
                autoComplete="family-name"
                required
                value={form.lastName}
                onChange={(v) => setForm({ ...form, lastName: v })}
              />
            </div>
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
            />
            <Field
              label="Mobile phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              minLength={7}
              hint="We&#39;ll text your confirmation and a reminder here."
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
            <div>
              <label
                htmlFor="notes"
                className="mb-1 block text-sm font-medium"
              >
                Anything we should know?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                maxLength={500}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
            <PrimaryButton type="submit">Review booking</PrimaryButton>
          </form>
        </StepShell>
      )}

      {step === 4 && service && slot && date && (
        <StepShell
          headingRef={headingRef}
          title="Review and confirm"
          onBack={() => goTo(3)}
        >
          <dl className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            <SummaryRow label="Service" value={service.name} />
            <SummaryRow
              label="With"
              value={
                capableStaff.find((s) => s.id === slot.staffId)?.name ?? ""
              }
            />
            <SummaryRow
              label="When"
              value={`${formatDateLong(date)} at ${formatTime(slot.time)}`}
            />
            <SummaryRow
              label="Duration"
              value={formatDuration(service.duration_min)}
            />
            <SummaryRow
              label="Price"
              value={formatMoney(service.price_cents)}
            />
            {service.deposit_cents > 0 && (
              <SummaryRow
                label="Deposit"
                value={`${formatMoney(service.deposit_cents)} held now, applied at checkout`}
              />
            )}
            <SummaryRow
              label="Contact"
              value={`${form.firstName} ${form.lastName} · ${form.phone}`}
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Cancel or reschedule at least 24 hours ahead to release your
            deposit. A confirmation text and email arrive right away.
          </p>
          <PrimaryButton
            className="mt-4"
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Confirming..." : "Confirm booking"}
          </PrimaryButton>
        </StepShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <ol aria-label="Booking steps" className="mb-6 flex items-center gap-1.5">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              i === current
                ? "bg-slatewell text-warmwhite"
                : i < current
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground"
            )}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <span aria-hidden="true" className="text-border">
              /
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function StepShell({
  title,
  children,
  onBack,
  headingRef,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  headingRef: React.RefObject<HTMLHeadingElement>;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="rounded-md border border-border bg-card p-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
        )}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function ChoiceButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-slatewell focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "w-full rounded-lg bg-slatewell px-4 py-3 font-medium text-warmwhite transition-colors hover:bg-slatewell/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 sm:w-auto sm:px-8",
        className
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  hint,
  type = "text",
  ...props
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "name"
>) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        {...props}
      />
      {hint && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DateTimeStep({
  headingRef,
  slug,
  service,
  staffChoice,
  enabledWeekdays,
  date,
  onBack,
  onPickDate,
  onPickSlot,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  slug: string;
  service: Service;
  staffChoice: number | "any";
  enabledWeekdays: Set<number>;
  date: string | null;
  onBack: () => void;
  onPickDate: (date: string) => void;
  onPickSlot: (slot: SlotOption) => void;
}) {
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Next 30 days, computed client-side in the visitor's local time.
  const days = useMemo(() => {
    const out: Array<{ iso: string; weekday: number }> = [];
    const d = new Date();
    for (let i = 0; i < 30; i++) {
      out.push({
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        weekday: d.getDay(),
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);

  useEffect(() => {
    if (!date) {
      setSlots(null);
      return;
    }
    let stale = false;
    setLoading(true);
    const params = new URLSearchParams({
      serviceId: String(service.id),
      date,
    });
    if (staffChoice !== "any") params.set("staffId", String(staffChoice));
    fetch(`/api/book/${slug}/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!stale) setSlots(data.slots ?? []);
      })
      .catch(() => {
        if (!stale) setSlots([]);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [date, service.id, slug, staffChoice]);

  const groups = useMemo(() => {
    if (!slots) return [];
    const morning = slots.filter((s) => s.time < "12:00");
    const afternoon = slots.filter((s) => s.time >= "12:00" && s.time < "17:00");
    const evening = slots.filter((s) => s.time >= "17:00");
    return [
      { label: "Morning", slots: morning },
      { label: "Afternoon", slots: afternoon },
      { label: "Evening", slots: evening },
    ].filter((g) => g.slots.length > 0);
  }, [slots]);

  return (
    <StepShell headingRef={headingRef} title="Pick a date and time" onBack={onBack}>
      <div
        role="listbox"
        aria-label="Date"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2"
      >
        {days.map((day) => {
          const open = enabledWeekdays.has(day.weekday);
          const selected = date === day.iso;
          return (
            <button
              key={day.iso}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!open}
              onClick={() => onPickDate(day.iso)}
              className={cn(
                "min-w-[4.5rem] shrink-0 rounded-lg border px-2 py-2.5 text-center text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                selected
                  ? "border-slatewell bg-slatewell text-warmwhite"
                  : open
                    ? "border-border bg-card hover:border-slatewell"
                    : "cursor-not-allowed border-border bg-muted text-muted-foreground/50"
              )}
            >
              <span className="block text-xs uppercase tracking-wide">
                {formatDateShort(day.iso).split(",")[0]}
              </span>
              <span className="block font-semibold">
                {Number(day.iso.slice(8))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 min-h-32" aria-live="polite">
        {!date && (
          <p className="text-sm text-muted-foreground">
            Choose a date to see open times.
          </p>
        )}
        {date && loading && (
          <p className="text-sm text-muted-foreground">Checking openings...</p>
        )}
        {date && !loading && slots && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No openings on {formatDateShort(date)}. Try another day.
          </p>
        )}
        {date &&
          !loading &&
          groups.map((group) => (
            <div key={group.label} className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                {group.label}
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {group.slots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => onPickSlot(s)}
                    className="rounded-lg border border-border bg-card py-2.5 text-sm font-medium transition-colors hover:border-slatewell hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {formatTime(s.time)}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </StepShell>
  );
}
