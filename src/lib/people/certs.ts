// Certification expiry math — pure and date-injected, like the obligations
// engine. A cert is "expiring" inside its lead window (default 60 days: long
// enough to schedule a food-handler class or a pesticide exam).

import { diffDays } from "@/lib/operations/engine";

export interface Certification {
  id: string;
  holder: string;
  profile_id: string | null;
  cert_name: string;
  license_number: string | null;
  issued_date: string | null;
  expires_date: string | null;
  document_path: string | null;
  /** Legacy records may still point at photos until an authorized storage migration copies them. */
  document_bucket?: "photos" | "certification-documents";
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CertStatus = "expired" | "expiring" | "ok" | "no_expiry";

export interface EvaluatedCert {
  cert: Certification;
  status: CertStatus;
  /** Days until expiry (negative = expired that many days ago); null when no expiry. */
  daysUntil: number | null;
}

export const CERT_LEAD_DAYS = 60;

export function evaluateCert(
  cert: Certification,
  today: Date,
  leadDays: number = CERT_LEAD_DAYS,
): EvaluatedCert {
  if (!cert.expires_date) return { cert, status: "no_expiry", daysUntil: null };
  const [y, m, d] = cert.expires_date.split("-").map(Number);
  const expires = new Date(y, m - 1, d);
  const daysUntil = diffDays(today, expires);
  const status: CertStatus =
    daysUntil < 0 ? "expired" : daysUntil <= leadDays ? "expiring" : "ok";
  return { cert, status, daysUntil };
}

/** Active certs evaluated and sorted: expired first (oldest lapse on top),
 *  then expiring by date, then ok, then no-expiry. */
export function evaluateCerts(certs: Certification[], today: Date): EvaluatedCert[] {
  const rank: Record<CertStatus, number> = { expired: 0, expiring: 1, ok: 2, no_expiry: 3 };
  return certs
    .filter((c) => c.is_active)
    .map((c) => evaluateCert(c, today))
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.daysUntil ?? Number.MAX_SAFE_INTEGER) - (b.daysUntil ?? Number.MAX_SAFE_INTEGER) ||
        a.cert.holder.localeCompare(b.cert.holder),
    );
}
