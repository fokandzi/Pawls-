/**
 * Provider supply core — the ONLY place that creates or approves a provider row.
 *
 * Rules enforced here (launch audit 2026-09-28, batch C):
 *   - A provider row is created ONLY for an authenticated owner: the caller's
 *     session id becomes `owner_user_id`. There is no anonymous provider
 *     creation and no client-supplied owner/status.
 *   - A new row always starts `approval_status = 'pending'` and is never
 *     visible on any public surface.
 *   - "Real supply" counts (`countRealProviders`) include approved, non-demo,
 *     owner-bound rows whose owner is a real (non-test) user. Pending,
 *     suspended, demo and legacy unowned rows are NEVER counted.
 *   - Only an admin can move a row pending -> approved | rejected, and never on
 *     their own provider (no self-approval) and never on an unowned legacy row.
 *     Every decision lands in the append-only audit trail.
 *
 * All errors are honest: they distinguish "we refused" (400/403/404/409) from
 * "the database is unavailable" (503). Nothing here ever reports a success it
 * did not perform.
 */
import { sql } from "../db";
import { writeAudit } from "./auth/ensure";
import { ensureBookingTablesSql } from "../db/schema";

/**
 * Pre-migration safety net (repo pattern: see mail_log status columns in
 * src/lib/auth/ensure.ts and the note in migration 005).
 *
 * Migration 008 (src/db/migrations/008_provider_registration_truth.sql) is the
 * CANONICAL definition of these columns. This helper exists so the provider
 * endpoints also work on a database where the migration has not been recorded
 * yet — it is additive (`ADD COLUMN IF NOT EXISTS`), never destructive, never
 * data-changing, and runs at most once per process.
 *
 * It deliberately does NOT drop the fabricated rating/review_count DEFAULTs:
 * schema changes that alter existing behaviour belong to the migration, which
 * runs under review (`bun run db:migrate`).
 */
let providerSchemaEnsured = false;
async function ensureProviderSchema(): Promise<void> {
  if (providerSchemaEnsured) return;
  await sql()`ALTER TABLE providers ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql()`ALTER TABLE providers ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql()`ALTER TABLE providers ADD COLUMN IF NOT EXISTS website TEXT`;
  await sql()`ALTER TABLE providers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`;
  await sql()`ALTER TABLE providers ADD COLUMN IF NOT EXISTS approved_by INTEGER`;
  providerSchemaEnsured = true;
}

export const PROVIDER_CATEGORIES = ["walker", "groomer", "sitter", "trainer", "vet"] as const;

export interface ProviderServiceInput {
  name: string;
  price_cents: number;
  duration_minutes: number;
}

export interface ProviderRegistrationInput {
  name: string;
  email: string;
  category: string;
  location: string;
  description: string;
  phone: string;
  website: string;
  services: ProviderServiceInput[];
}

export interface CoreError {
  ok: false;
  status: number;
  code: string;
  /** English message (the caller picks the locale it renders). */
  message: string;
  /** French message. */
  messageFr: string;
}

export type RegisterProviderResult =
  | { ok: true; status: 201; providerId: number; approvalStatus: "pending" }
  | CoreError;

export type ApprovalResult =
  | { ok: true; status: 200; providerId: number; approvalStatus: "approved" | "rejected" }
  | CoreError;

function fail(status: number, code: string, message: string, messageFr: string): CoreError {
  return { ok: false, status, code, message, messageFr };
}

/**
 * Honest, real-only provider count. 0 means 0 — never a raw COUNT(*).
 * Clause: approved AND not demo AND owner-bound AND owner is a real (non-test)
 * user. Pending, rejected, suspended, demo and legacy unowned rows are excluded.
 */
export async function countRealProviders(): Promise<number> {
  await ensureProviderSchema();
  const rows = (await sql()`
    SELECT COUNT(*)::int AS count
    FROM providers p
    JOIN users u ON u.id = p.owner_user_id
    WHERE p.is_demo = false
      AND p.approval_status = 'approved'
      AND p.owner_user_id IS NOT NULL
      AND u.is_test = false
  `) as unknown as { count: number }[];
  return Number(rows?.[0]?.count ?? 0);
}

const LIMITS = {
  name: 120,
  email: 200,
  location: 160,
  description: 2000,
  phone: 40,
  website: 300,
  serviceName: 120,
  services: 10,
  priceMax: 500_000, // €5,000.00
  durationMax: 24 * 60,
};

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= LIMITS.email;
}

/**
 * Validate + normalize a provider application. Server-side only — the browser
 * form's validation is a convenience, never a gate.
 */
export function validateProviderInput(raw: unknown): { ok: true; value: ProviderRegistrationInput } | CoreError {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const name = cleanText(d.name, LIMITS.name);
  const email = cleanText(d.email, LIMITS.email).toLowerCase();
  const category = cleanText(d.category, 20).toLowerCase();
  const location = cleanText(d.location, LIMITS.location);
  const description = String(d.description ?? "").trim().slice(0, LIMITS.description);
  const phone = cleanText(d.phone, LIMITS.phone);
  const website = cleanText(d.website, LIMITS.website);

  if (!name) {
    return fail(400, "NAME_REQUIRED", "Your business name is required.", "Le nom de votre activité est obligatoire.");
  }
  if (!looksLikeEmail(email)) {
    return fail(400, "EMAIL_INVALID", "Enter a valid email address.", "Saisissez une adresse email valide.");
  }
  if (!(PROVIDER_CATEGORIES as readonly string[]).includes(category)) {
    return fail(
      400,
      "CATEGORY_INVALID",
      "Choose one of the supported service categories.",
      "Choisissez l'une des catégories de service proposées.",
    );
  }
  if (!location) {
    return fail(400, "LOCATION_REQUIRED", "Your city or area is required.", "Votre ville ou quartier est obligatoire.");
  }
  if (description.length < 20) {
    return fail(
      400,
      "DESCRIPTION_TOO_SHORT",
      "Describe your business in at least 20 characters.",
      "Décrivez votre activité en au moins 20 caractères.",
    );
  }
  if (website && !/^https?:\/\//i.test(website)) {
    return fail(
      400,
      "WEBSITE_INVALID",
      "The website must start with http:// or https://.",
      "Le site web doit commencer par http:// ou https://.",
    );
  }

  const rawServices = Array.isArray(d.services) ? d.services : [];
  if (rawServices.length === 0) {
    return fail(400, "SERVICE_REQUIRED", "Add at least one service.", "Ajoutez au moins une prestation.");
  }
  if (rawServices.length > LIMITS.services) {
    return fail(
      400,
      "TOO_MANY_SERVICES",
      `You can list up to ${LIMITS.services} services.`,
      `Vous pouvez lister jusqu'à ${LIMITS.services} prestations.`,
    );
  }
  const services: ProviderServiceInput[] = [];
  for (const entry of rawServices) {
    const s = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const sName = cleanText(s.name, LIMITS.serviceName);
    const price = Math.round(Number(s.price_cents));
    const duration = Math.round(Number(s.duration_minutes));
    if (!sName) {
      return fail(400, "SERVICE_NAME_REQUIRED", "Each service needs a name.", "Chaque prestation doit avoir un nom.");
    }
    if (!Number.isFinite(price) || price <= 0 || price > LIMITS.priceMax) {
      return fail(400, "SERVICE_PRICE_INVALID", "Each service needs a valid price.", "Chaque prestation doit avoir un prix valide.");
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > LIMITS.durationMax) {
      return fail(
        400,
        "SERVICE_DURATION_INVALID",
        "Each service needs a valid duration in minutes.",
        "Chaque prestation doit avoir une durée valide en minutes.",
      );
    }
    services.push({ name: sName, price_cents: price, duration_minutes: duration });
  }

  return { ok: true, value: { name, email, category, location, description, phone, website, services } };
}

/**
 * Create a PENDING provider application bound to the authenticated owner.
 * Never anonymous, never approved, never demo. Honest conflicts are reported
 * instead of silently creating duplicates.
 */
export async function registerProviderForOwner(ownerUserId: number, raw: unknown): Promise<RegisterProviderResult> {
  const owner = Number(ownerUserId);
  if (!Number.isSafeInteger(owner) || owner <= 0) {
    return fail(401, "UNAUTHENTICATED", "Please log in to continue.", "Connectez-vous pour continuer.");
  }

  const validated = validateProviderInput(raw);
  if (!validated.ok) return validated;
  const input = validated.value;

  try {
    await ensureProviderSchema();
    await ensureBookingTablesSql();

    // One application per owner account (the row IS the application).
    const [mine] = (await sql()`
      SELECT id, approval_status FROM providers
      WHERE owner_user_id = ${owner} AND is_demo = false
      ORDER BY id DESC LIMIT 1
    `) as unknown as { id: number; approval_status: string }[];
    if (mine) {
      return fail(
        409,
        "ALREADY_APPLIED",
        `You already have a provider application (#${Number(mine.id)}, status: ${String(mine.approval_status)}).`,
        `Vous avez déjà une demande prestataire (#${Number(mine.id)}, statut : ${String(mine.approval_status)}).`,
      );
    }

    // Same contact email on a real provider of ANOTHER account: refuse instead
    // of creating a second, unowned duplicate.
    const [clash] = (await sql()`
      SELECT id FROM providers
      WHERE email IS NOT NULL AND lower(email) = ${input.email}
        AND is_demo = false AND owner_user_id IS NOT NULL AND owner_user_id <> ${owner}
      LIMIT 1
    `) as unknown as { id: number }[];
    if (clash) {
      return fail(
        409,
        "EMAIL_IN_USE",
        "Another provider account already uses this email address.",
        "Une autre fiche prestataire utilise déjà cette adresse email.",
      );
    }

    const [created] = (await sql()`
      INSERT INTO providers
        (name, email, category, description, location, phone, website,
         owner_user_id, approval_status, is_demo)
      VALUES
        (${input.name}, ${input.email}, ${input.category}, ${input.description},
         ${input.location}, ${input.phone || null}, ${input.website || null},
         ${owner}, 'pending', false)
      RETURNING id
    `) as unknown as { id: number }[];

    const providerId = Number(created.id);

    for (const s of input.services) {
      await sql()`
        INSERT INTO services (provider_id, name, price_cents, duration_minutes)
        VALUES (${providerId}, ${s.name}, ${s.price_cents}, ${s.duration_minutes})
      `;
    }

    writeAudit(owner, "provider_application_submitted", {
      provider_id: providerId,
      category: input.category,
      city: input.location,
    });

    return { ok: true, status: 201, providerId, approvalStatus: "pending" };
  } catch (err) {
    console.error("[provider-core] registerProviderForOwner failed", err);
    return fail(
      503,
      "DB_UNAVAILABLE",
      "We couldn't submit your application right now. Nothing was created — please try again.",
      "Nous n'avons pas pu enregistrer votre demande. Rien n'a été créé — réessayez dans un instant.",
    );
  }
}

export interface AdminProviderRow {
  id: number;
  name: string;
  category: string;
  location: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  approval_status: string;
  is_demo: boolean;
  owner_user_id: number | null;
  owner_email: string | null;
  owner_name: string | null;
  owner_is_test: boolean | null;
  approved_at: string | null;
  approved_by: number | null;
  created_at: string;
  services_count: number;
  /** False for legacy rows with no owner account: they can never be approved. */
  approvable: boolean;
}

/**
 * Admin queue: every provider row with its owner binding and honest flags.
 * Reads only — approval decisions go through adminDecideProvider.
 */
export async function adminListProviders(): Promise<AdminProviderRow[]> {
  await ensureProviderSchema();
  const rows = (await sql()`
    SELECT p.id, p.name, p.category, p.location, p.email, p.phone, p.website,
           p.approval_status, p.is_demo, p.owner_user_id, p.approved_at, p.approved_by, p.created_at,
           u.email AS owner_email, u.name AS owner_name, u.is_test AS owner_is_test,
           (SELECT COUNT(*)::int FROM services s WHERE s.provider_id = p.id) AS services_count
    FROM providers p
    LEFT JOIN users u ON u.id = p.owner_user_id
    ORDER BY (p.approval_status = 'pending' AND p.owner_user_id IS NOT NULL) DESC, p.created_at DESC, p.id DESC
    LIMIT 200
  `) as unknown as Record<string, unknown>[];

  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    category: String(r.category ?? ""),
    location: String(r.location ?? ""),
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    website: r.website ? String(r.website) : null,
    approval_status: String(r.approval_status ?? "pending"),
    is_demo: !!r.is_demo,
    owner_user_id: r.owner_user_id === null || r.owner_user_id === undefined ? null : Number(r.owner_user_id),
    owner_email: r.owner_email ? String(r.owner_email) : null,
    owner_name: r.owner_name ? String(r.owner_name) : null,
    owner_is_test: r.owner_is_test === null || r.owner_is_test === undefined ? null : !!r.owner_is_test,
    approved_at: r.approved_at ? String(r.approved_at) : null,
    approved_by: r.approved_by === null || r.approved_by === undefined ? null : Number(r.approved_by),
    created_at: String(r.created_at ?? ""),
    services_count: Number(r.services_count ?? 0),
    approvable: !r.is_demo && r.owner_user_id !== null && r.owner_user_id !== undefined && String(r.approval_status) === "pending",
  }));
}

/**
 * Admin decision: pending -> approved | rejected. Guarded by the caller
 * (requireAdmin) AND by the rules below, which are the product truth:
 *   - unowned legacy rows can NEVER be approved (refused, untouched);
 *   - an admin can never decide their own provider row (no self-approval);
 *   - demo rows are not approvable supply;
 *   - only a PENDING row can be decided (no silent re-decisions).
 */
export async function adminDecideProvider(
  adminUserId: number,
  providerId: number,
  decision: string,
  note: string | null,
): Promise<ApprovalResult> {
  const pid = Number(providerId);
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return fail(400, "BAD_PROVIDER_ID", "Invalid provider id.", "Identifiant prestataire invalide.");
  }
  if (decision !== "approve" && decision !== "reject") {
    return fail(400, "BAD_DECISION", "Decision must be 'approve' or 'reject'.", "La décision doit être « approve » ou « reject ».");
  }
  const cleanNote = String(note ?? "").trim().slice(0, 500) || null;
  const nextStatus = decision === "approve" ? "approved" : "rejected";

  try {
    await ensureProviderSchema();
    const [row] = (await sql()`
      SELECT id, name, approval_status, is_demo, owner_user_id
      FROM providers WHERE id = ${pid} LIMIT 1
    `) as unknown as { id: number; name: string; approval_status: string; is_demo: boolean; owner_user_id: number | null }[];

    if (!row) {
      return fail(404, "PROVIDER_NOT_FOUND", "Provider not found.", "Prestataire introuvable.");
    }
    if (row.owner_user_id === null || row.owner_user_id === undefined) {
      return fail(
        409,
        "UNOWNED_PROVIDER",
        "This provider row has no owner account, so it cannot be approved. Ask the owner to register.",
        "Cette fiche prestataire n'est liée à aucun compte : elle ne peut pas être approuvée. Demandez au prestataire de s'inscrire.",
      );
    }
    if (Number(row.owner_user_id) === Number(adminUserId)) {
      return fail(
        403,
        "SELF_APPROVAL_FORBIDDEN",
        "You cannot decide the approval status of your own provider listing.",
        "Vous ne pouvez pas décider du statut de votre propre fiche prestataire.",
      );
    }
    if (row.is_demo) {
      return fail(
        409,
        "DEMO_PROVIDER",
        "Demo rows are not approvable supply.",
        "Les fiches de démonstration ne peuvent pas être approuvées.",
      );
    }
    if (String(row.approval_status) !== "pending") {
      return fail(
        409,
        "ALREADY_DECIDED",
        `This provider is already '${String(row.approval_status)}'.`,
        `Ce prestataire est déjà « ${String(row.approval_status)} ».`,
      );
    }

    const updated = (await sql()`
      UPDATE providers
      SET approval_status = ${nextStatus},
          approved_at = NOW(),
          approved_by = ${adminUserId}
      WHERE id = ${pid}
        AND approval_status = 'pending'
        AND owner_user_id IS NOT NULL
      RETURNING id
    `) as unknown as { id: number }[];

    if (!updated.length) {
      return fail(
        409,
        "ALREADY_DECIDED",
        "This provider was decided by someone else just now.",
        "Ce prestataire vient d'être traité par quelqu'un d'autre.",
      );
    }

    writeAudit(adminUserId, decision === "approve" ? "provider_approved" : "provider_rejected", {
      provider_id: pid,
      provider_name: String(row.name ?? ""),
      owner_user_id: Number(row.owner_user_id),
      previous_status: String(row.approval_status),
      new_status: nextStatus,
      note: cleanNote,
    });

    return { ok: true, status: 200, providerId: pid, approvalStatus: nextStatus };
  } catch (err) {
    console.error("[provider-core] adminDecideProvider failed", err);
    return fail(
      503,
      "DB_UNAVAILABLE",
      "We couldn't update this provider right now. Nothing was changed.",
      "Nous n'avons pas pu mettre à jour ce prestataire. Rien n'a été modifié.",
    );
  }
}
