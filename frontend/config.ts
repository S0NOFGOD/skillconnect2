"use strict";

// ==========================
// API CONFIGURATION
// ==========================

const DEVELOPMENT_API_URL = "http://localhost:5000";
const PRODUCTION_API_URL = "https://skillconnect-api-j0vt.onrender.com";

const REFRESH_TOKEN_ENDPOINT = "/api/auth/refresh";

const isDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

const API_URL = isDevelopment
    ? DEVELOPMENT_API_URL
    : PRODUCTION_API_URL;


// ==========================
// API ENDPOINT
// ==========================

export function API_ENDPOINT(path: string): string {
    const cleanPath = path.startsWith("/")
        ? path
        : `/${path}`;

    return `${API_URL}${cleanPath}`;
}


// ==========================
// REFRESH TOKEN
// ==========================

let refreshTokenPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {

    if (refreshTokenPromise) return refreshTokenPromise;

    refreshTokenPromise = (async () => {

        try {

            const response = await fetch(
                API_ENDPOINT(REFRESH_TOKEN_ENDPOINT),
                {
                    method: "POST",
                    credentials: "include"
                }
            );

            if (!response.ok) {

                window.dispatchEvent(
                    new CustomEvent("authSessionExpired")
                );

                return false;
            }

            window.dispatchEvent(
                new CustomEvent("accessTokenRefreshed")
            );

            return true;

        } catch (error) {

            console.error("Refresh token request failed:", error);

            window.dispatchEvent(
                new CustomEvent("authSessionExpired")
            );

            return false;

        } finally {

            refreshTokenPromise = null;
        }

    })();

    return refreshTokenPromise;
}


// ==========================
// API REQUEST
// ==========================

export async function API_REQUEST(
    path: string,
    options: RequestInit = {}
): Promise<Response> {

    const requestOptions: RequestInit = {
        ...options,
        credentials: "include",
        headers: new Headers(options.headers)
    };

    let response = await fetch(
        API_ENDPOINT(path),
        requestOptions
    );

    if (response.status !== 401) return response;

    const refreshed = await refreshAccessToken();

    if (!refreshed) return response;

    response = await fetch(
        API_ENDPOINT(path),
        requestOptions
    );

    return response;
}


// ==========================
// AUTH EVENTS
// ==========================

window.addEventListener(
    "accessTokenRefreshed",
    () => {
        console.log("SkillConnect access token refreshed.");
    }
);

window.addEventListener(
    "authSessionExpired",
    () => {
        console.warn("SkillConnect authentication session expired.");
    }
);


// ==========================
// ENVIRONMENT
// ==========================

console.log(
    `SkillConnect API environment: ${
        isDevelopment ? "DEVELOPMENT" : "PRODUCTION"
    }`
);

console.log(`SkillConnect API URL: ${API_URL}`);