// The /register native POST is now part of the auth flow in src/auth-handler.ts
// (scrypt hashing, verify-email, sessions). The forgeable pawls_user cookie and
// the cookie-only fake-account fallback are GONE.
export { handleRegisterPost } from "./src/auth-handler.ts";
