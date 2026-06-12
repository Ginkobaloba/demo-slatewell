/**
 * Pre-appointment instructions, keyed by service name with a generic
 * fallback (D-008: copy lives in code, not the database, until a real
 * tenant needs to edit it).
 */
const BY_SERVICE: Record<string, string[]> = {
  "Signature Facial (60 min)": [
    "Arrive with clean skin if you can; we cleanse again anyway.",
    "Skip retinoids and exfoliants for 48 hours before your visit.",
  ],
  "Luxe Facial (90 min)": [
    "Skip retinoids and exfoliants for 48 hours before your visit.",
    "Plan a makeup-free evening afterward so the mask can do its work.",
  ],
  "Skin Consultation (30 min)": [
    "Bring (or photograph) the products you currently use.",
    "Arrive makeup-free if possible so we can see your skin as it is.",
  ],
  Microneedling: [
    "No retinoids, acids, or sun exposure for 72 hours before.",
    "Arrive makeup-free. Numbing is applied on arrival; the appointment time includes it.",
    "Expect redness for 24-48 hours afterward; plan your calendar accordingly.",
  ],
  Dermaplane: [
    "Skip exfoliants for 48 hours before your visit.",
    "Avoid direct sun the day of your appointment.",
  ],
  "Brow Lamination": [
    "Arrive with bare brows (no pencil, gel, or powder).",
    "Keep brows dry for 24 hours after your appointment.",
  ],
  "Lip Treatment": [
    "Stay hydrated the day before and day of your visit.",
    "Avoid lip products for 2 hours before your appointment.",
  ],
  "Body Contour Session": [
    "Drink plenty of water before and after; it improves results.",
    "Wear comfortable clothing you can change out of easily.",
  ],
};

const GENERIC = [
  "Please arrive 10 minutes early so we can start on time.",
  "Need to change plans? Use the cancel link below at least 24 hours ahead to release your deposit.",
];

export function getInstructions(serviceName: string): string[] {
  return [...(BY_SERVICE[serviceName] ?? []), ...GENERIC];
}
