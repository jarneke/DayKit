import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookieName, getSession } from "@/lib/auth";

const publicPaths = new Set([
    "/login",
    "/api/auth",
    "/favicon.ico",
    "/apple-icon",
    "/manifest.webmanifest",
    "/sw.js",
    "/daykit-morning.png",
    "/daykit-afternoon.png",
    "/daykit-evening.png",
]);

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    if (publicPaths.has(pathname)) {
        return NextResponse.next();
    }

    try {
        const token =
            request.cookies.get(cookieName("session"))?.value ?? null;

        const session = await getSession(token);

        if (!session) {
            if (pathname === "/api" || pathname.startsWith("/api/")) {
                return NextResponse.json(
                    { error: "Je bent niet ingelogd." },
                    {
                        status: 401,
                        headers: {
                            "Cache-Control": "private, no-store",
                        },
                    },
                );
            }

            const response = NextResponse.redirect(
                new URL("/login", request.url),
                303,
            );

            response.headers.set("Cache-Control", "private, no-store");

            return response;
        }

        const response = NextResponse.next();

        response.headers.set("Cache-Control", "private, no-store");

        return response;
    } catch (error) {
        console.error(
            "Daykit session check failed:",
            error instanceof Error ? error.name : "UnknownError",
        );

        if (pathname === "/api" || pathname.startsWith("/api/")) {
            return NextResponse.json(
                { error: "Je toegang kon niet gecontroleerd worden." },
                {
                    status: 503,
                    headers: {
                        "Cache-Control": "private, no-store",
                    },
                },
            );
        }

        return new NextResponse(
            "Daykit kon je toegang niet controleren. Probeer het later opnieuw.",
            {
                status: 503,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "private, no-store",
                },
            },
        );
    }
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image).*)",
    ],
};