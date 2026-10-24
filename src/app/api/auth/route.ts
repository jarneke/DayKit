import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
    AuthenticationResponseJSON,
    RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
    AuthError,
    authConfig,
    consumeChallenge,
    createSession,
    database,
    destroySession,
    requireSession,
    saveChallenge,
    takeRateLimit,
    verifyAccessCode,
} from "@/lib/auth";

type PasskeyRow = {
    id: string;
    public_key: string;
    counter: string | number;
    transports: string[];
};

function json(body: unknown, status = 200) {
    return Response.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
            ...(status === 429 ? { "Retry-After": "900" } : {}),
        },
    });
}

async function readBody(request: Request) {
    if (
        !request.headers
            .get("content-type")
            ?.toLowerCase()
            .startsWith("application/json")
    ) {
        throw new AuthError("Ongeldige aanvraag.", 415);
    }

    const text = await request.text();

    if (text.length > 32_000) {
        throw new AuthError("Deze aanvraag is te groot.", 413);
    }

    let body: unknown;

    try {
        body = JSON.parse(text);
    } catch {
        throw new AuthError("Ongeldige aanvraag.");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AuthError("Ongeldige aanvraag.");
    }

    return body as Record<string, unknown>;
}

async function getPasskeys() {
    const sql = database();

    return (await sql`
    SELECT id, public_key, counter, transports
    FROM public.daykit_passkey
    WHERE owner_id = 'owner'
    ORDER BY created_at
  `) as PasskeyRow[];
}

async function handle(request: Request) {
    const config = authConfig();

    if (request.headers.get("origin") !== config.origin) {
        throw new AuthError(
            "Open Daykit via het vaste appadres en probeer opnieuw.",
            403,
        );
    }

    const body = await readBody(request);
    const sql = database();

    switch (body.action) {
        case "code": {
            await takeRateLimit("daykit-code-login", 10);

            if (!(await verifyAccessCode(body.code))) {
                throw new AuthError("Je toegangscode klopt niet.", 401);
            }

            await createSession();
            return json({ ok: true });
        }

        case "logout": {
            await destroySession();
            return json({ ok: true });
        }

        case "registration-options": {
            const session = await requireSession();
            await takeRateLimit("daykit-passkey-registration", 30);

            const owners = await sql`
        SELECT name, webauthn_user_id
        FROM public.daykit_owner
        WHERE id = ${session.ownerId}
        LIMIT 1
      `;

            if (!owners[0]) {
                throw new AuthError("Je persoonlijke toegang ontbreekt.", 503);
            }

            const passkeys = await getPasskeys();

            const options = await generateRegistrationOptions({
                rpName: "Daykit",
                rpID: config.rpID,
                userName: "daykit-owner",
                userDisplayName: String(owners[0].name),
                userID: new TextEncoder().encode(
                    String(owners[0].webauthn_user_id),
                ),
                attestationType: "none",
                supportedAlgorithmIDs: [-7, -257],
                excludeCredentials: passkeys.map((passkey) => ({
                    id: passkey.id,
                    transports: passkey.transports,
                })),
                authenticatorSelection: {
                    residentKey: "required",
                    userVerification: "required",
                    authenticatorAttachment: "platform",
                },
            });

            await saveChallenge(
                "registration",
                options.challenge,
                session.tokenHash,
            );

            return json(options);
        }

        case "registration-verify": {
            const session = await requireSession();
            await takeRateLimit("daykit-passkey-registration", 30);

            const challenge = await consumeChallenge(
                "registration",
                session.tokenHash,
            );

            let verification;

            try {
                verification = await verifyRegistrationResponse({
                    response: body.response as RegistrationResponseJSON,
                    expectedChallenge: challenge,
                    expectedOrigin: config.origin,
                    expectedRPID: config.rpID,
                    requireUserVerification: true,
                    supportedAlgorithmIDs: [-7, -257],
                });
            } catch {
                throw new AuthError(
                    "De passkey kon niet gecontroleerd worden. Probeer opnieuw.",
                );
            }

            if (!verification.verified) {
                throw new AuthError("De passkey kon niet gecontroleerd worden.");
            }

            const info = verification.registrationInfo;
            const credential = info.credential;

            await sql`
        INSERT INTO public.daykit_passkey (
          id,
          owner_id,
          public_key,
          counter,
          transports,
          device_type,
          backed_up
        )
        VALUES (
          ${credential.id},
          ${session.ownerId},
          ${Buffer.from(credential.publicKey).toString("base64url")},
          ${credential.counter},
          ${credential.transports || []},
          ${info.credentialDeviceType},
          ${info.credentialBackedUp}
        )
      `;

            return json({ ok: true });
        }

        case "authentication-options": {
            await takeRateLimit("daykit-passkey-login", 60);

            const passkeys = await getPasskeys();

            if (passkeys.length === 0) {
                throw new AuthError(
                    "Gebruik eerst je toegangscode en stel daarna een passkey in.",
                );
            }

            const options = await generateAuthenticationOptions({
                rpID: config.rpID,
                userVerification: "required",
                allowCredentials: passkeys.map((passkey) => ({
                    id: passkey.id,
                    transports: passkey.transports,
                })),
            });

            await saveChallenge("authentication", options.challenge, null);

            return json(options);
        }

        case "authentication-verify": {
            await takeRateLimit("daykit-passkey-login", 60);

            const challenge = await consumeChallenge("authentication", null);
            const response = body.response as AuthenticationResponseJSON | undefined;

            if (!response || typeof response.id !== "string") {
                throw new AuthError("Ongeldige passkey.");
            }

            const rows = (await sql`
        SELECT id, public_key, counter, transports
        FROM public.daykit_passkey
        WHERE id = ${response.id}
          AND owner_id = 'owner'
        LIMIT 1
      `) as PasskeyRow[];

            const passkey = rows[0];

            if (!passkey) {
                throw new AuthError("Deze passkey is niet bekend bij Daykit.", 401);
            }

            const counter = Number(passkey.counter);

            if (!Number.isSafeInteger(counter) || counter < 0) {
                throw new Error("Ongeldige opgeslagen passkeyteller.");
            }

            let verification;

            try {
                verification = await verifyAuthenticationResponse({
                    response,
                    expectedChallenge: challenge,
                    expectedOrigin: config.origin,
                    expectedRPID: config.rpID,
                    requireUserVerification: true,
                    credential: {
                        id: passkey.id,
                        publicKey: Uint8Array.from(
                            Buffer.from(passkey.public_key, "base64url"),
                        ),
                        counter,
                        transports: passkey.transports,
                    },
                });
            } catch {
                throw new AuthError(
                    "Ontgrendelen is niet gelukt. Probeer opnieuw of gebruik je code.",
                    401,
                );
            }

            if (!verification.verified) {
                throw new AuthError("De passkey kon niet gecontroleerd worden.", 401);
            }

            const info = verification.authenticationInfo;

            const updated = await sql`
        UPDATE public.daykit_passkey
        SET
          counter = ${info.newCounter},
          device_type = ${info.credentialDeviceType},
          backed_up = ${info.credentialBackedUp},
          last_used_at = now()
        WHERE id = ${passkey.id}
          AND owner_id = 'owner'
          AND counter = ${counter}
        RETURNING id
      `;

            if (!updated[0]) {
                throw new AuthError(
                    "De passkey is ondertussen gewijzigd. Probeer opnieuw.",
                    409,
                );
            }

            await createSession();
            return json({ ok: true });
        }

        default:
            throw new AuthError("Deze actie bestaat niet.", 404);
    }
}

export async function POST(request: Request) {
    try {
        return await handle(request);
    } catch (error) {
        if (error instanceof AuthError) {
            return json({ error: error.message }, error.status);
        }

        console.error(
            "Daykit authentication failed:",
            error instanceof Error ? error.name : "UnknownError",
        );

        return json(
            {
                error:
                    "Daykit kon je toegang niet verwerken. Probeer het later opnieuw.",
            },
            503,
        );
    }
}