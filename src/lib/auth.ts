import "server-only";

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";
import { cookies } from "next/headers";

const deriveKey = promisify(scrypt);
const SESSION_SECONDS = 12 * 60 * 60;
const CHALLENGE_SECONDS = 5 * 60;

export class AuthError extends Error {
    constructor(
        message: string,
        public readonly status = 400,
    ) {
        super(message);
        this.name = "AuthError";
    }
}

export function database() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("DATABASE_URL ontbreekt.");
    }

    return neon(connectionString);
}

export function authConfig() {
    const configuredOrigin =
        process.env.DAYKIT_ORIGIN?.trim() ||
        (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");

    if (!configuredOrigin) {
        throw new Error("DAYKIT_ORIGIN ontbreekt.");
    }

    const url = new URL(configuredOrigin);
    const localDevelopment =
        process.env.NODE_ENV === "development" &&
        url.protocol === "http:" &&
        url.hostname === "localhost";

    if (
        (!localDevelopment && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    ) {
        throw new Error("DAYKIT_ORIGIN moet een geldig websiteadres zijn.");
    }

    return {
        origin: url.origin,
        rpID: url.hostname,
        secure: url.protocol === "https:",
    };
}

function cookieName(kind: "session" | "challenge") {
    return authConfig().secure
        ? `__Host-daykit-${kind}`
        : `daykit-${kind}`;
}

function cookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: authConfig().secure,
        sameSite: "strict" as const,
        path: "/",
        maxAge,
    };
}

export function hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
}

export type Session = {
    tokenHash: string;
    ownerId: string;
    name: string;
    expiresAt: number;
};

export async function getSession(): Promise<Session | null> {
    const store = await cookies();
    const token = store.get(cookieName("session"))?.value;

    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        return null;
    }

    const sql = database();
    const rows = await sql`
    SELECT
      s.token_hash,
      s.owner_id,
      o.name,
      (extract(epoch FROM s.expires_at) * 1000)::bigint AS expires_at_ms
    FROM public.daykit_session s
    JOIN public.daykit_owner o ON o.id = s.owner_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > now()
    LIMIT 1
  `;

    const row = rows[0];

    if (!row) {
        return null;
    }

    return {
        tokenHash: String(row.token_hash),
        ownerId: String(row.owner_id),
        name: String(row.name),
        expiresAt: Number(row.expires_at_ms),
    };
}

export async function requireSession() {
    const session = await getSession();

    if (!session) {
        throw new AuthError("Je sessie is verlopen. Ontgrendel Daykit opnieuw.", 401);
    }

    return session;
}

export async function createSession() {
    const sql = database();
    const store = await cookies();
    const previousToken = store.get(cookieName("session"))?.value;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);

    await sql`
    DELETE FROM public.daykit_session
    WHERE expires_at <= now()
       OR token_hash = ${hashToken(previousToken || "")}
  `;

    await sql`
    INSERT INTO public.daykit_session (token_hash, owner_id, expires_at)
    VALUES (${hashToken(token)}, 'owner', ${expiresAt.toISOString()})
  `;

    store.set(
        cookieName("session"),
        token,
        cookieOptions(SESSION_SECONDS),
    );

    store.set(cookieName("challenge"), "", cookieOptions(0));
}

export async function destroySession() {
    const store = await cookies();
    const token = store.get(cookieName("session"))?.value;

    if (token) {
        const sql = database();

        await sql`
      DELETE FROM public.daykit_session
      WHERE token_hash = ${hashToken(token)}
    `;
    }

    store.set(cookieName("session"), "", cookieOptions(0));
    store.set(cookieName("challenge"), "", cookieOptions(0));
}

export async function verifyAccessCode(input: unknown) {
    if (typeof input !== "string" || input.length < 8 || input.length > 128) {
        return false;
    }

    const configuredHash = process.env.DAYKIT_ACCESS_CODE_HASH?.trim();
    const match = configuredHash?.match(
        /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/,
    );

    if (!match) {
        throw new Error("DAYKIT_ACCESS_CODE_HASH ontbreekt of is ongeldig.");
    }

    const actual = (await deriveKey(input, match[1], 64)) as Buffer;
    const expected = Buffer.from(match[2], "hex");

    return timingSafeEqual(actual, expected);
}

export async function takeRateLimit(scope: string, limit: number) {
    const sql = database();
    const key = hashToken(scope);

    const rows = await sql`
    INSERT INTO public.daykit_auth_rate_limit
      (key_hash, attempts, window_started_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (key_hash) DO UPDATE
    SET
      attempts = CASE
        WHEN daykit_auth_rate_limit.window_started_at
          <= now() - interval '15 minutes'
        THEN 1
        ELSE daykit_auth_rate_limit.attempts + 1
      END,
      window_started_at = CASE
        WHEN daykit_auth_rate_limit.window_started_at
          <= now() - interval '15 minutes'
        THEN now()
        ELSE daykit_auth_rate_limit.window_started_at
      END
    RETURNING attempts
  `;

    if (Number(rows[0].attempts) > limit) {
        throw new AuthError(
            "Te veel pogingen. Wacht een kwartier en probeer opnieuw.",
            429,
        );
    }
}

export async function hasPasskeys() {
    const sql = database();

    const rows = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM public.daykit_passkey
      WHERE owner_id = 'owner'
    ) AS available
  `;

    return rows[0].available === true;
}

export async function saveChallenge(
    purpose: "registration" | "authentication",
    challenge: string,
    sessionHash: string | null,
) {
    const store = await cookies();
    const previousToken = store.get(cookieName("challenge"))?.value;
    const token = randomBytes(32).toString("base64url");
    const sql = database();

    await sql`
    DELETE FROM public.daykit_auth_challenge
    WHERE expires_at <= now()
       OR token_hash = ${hashToken(previousToken || "")}
  `;

    await sql`
    INSERT INTO public.daykit_auth_challenge
      (token_hash, purpose, challenge, session_hash, expires_at)
    VALUES (
      ${hashToken(token)},
      ${purpose},
      ${challenge},
      ${sessionHash},
      ${new Date(Date.now() + CHALLENGE_SECONDS * 1000).toISOString()}
    )
  `;

    store.set(
        cookieName("challenge"),
        token,
        cookieOptions(CHALLENGE_SECONDS),
    );
}

export async function consumeChallenge(
    purpose: "registration" | "authentication",
    sessionHash: string | null,
) {
    const store = await cookies();
    const token = store.get(cookieName("challenge"))?.value;

    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new AuthError(
            "Deze aanvraag is verlopen. Probeer opnieuw.",
        );
    }

    const sql = database();

    const rows = await sql`
    DELETE FROM public.daykit_auth_challenge
    WHERE token_hash = ${hashToken(token)}
      AND purpose = ${purpose}
      AND session_hash IS NOT DISTINCT FROM ${sessionHash}
      AND expires_at > now()
    RETURNING challenge
  `;

    store.set(cookieName("challenge"), "", cookieOptions(0));

    if (!rows[0]) {
        throw new AuthError(
            "Deze aanvraag is verlopen of al gebruikt. Probeer opnieuw.",
        );
    }

    return String(rows[0].challenge);
}