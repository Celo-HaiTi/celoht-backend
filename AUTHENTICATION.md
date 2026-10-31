# AUTHENTICATION.md — Wallet Sign-In Flow

```
POST /api/v1/auth/nonce   { walletAddress }
  -> { message, nonce, expiresAt }         (nonce stored server-side, unused, TTL-bound)

Client signs `message` with the wallet's private key (never sent to the backend)
The signed challenge includes pilot chain ID `11142220`.

POST /api/v1/auth/verify  { walletAddress, nonce, signature }
  -> verify signature (viem.verifyMessage)
  -> atomically consume the nonce (fails if reused/expired/unknown)
  -> find-or-create profiles row
  -> issue HMAC-signed session token, set as httpOnly cookie

GET /api/v1/auth/session
  -> { authenticated, profileId, walletAddress, role } (role reloaded from Supabase)

POST /api/v1/auth/logout
  -> clear the session cookie
```

## Replay protection
Each nonce is single-use: `consumeChallenge()` updates the row with
`used_at` only when `used_at IS NULL`, and rejects if zero rows were
affected — so two concurrent verification attempts with the same nonce
cannot both succeed.

## Expired challenge protection
`auth_challenges.expires_at` is checked before consumption; anything past
`AUTH_NONCE_TTL_SECONDS` (default 300s) is rejected regardless of a valid
signature.

## Invalid signature protection
`verifyWalletSignature` uses `viem`'s EIP-191 message verification. A
mismatched signature fails before the nonce store is even touched, which
also avoids leaking whether a given nonce exists.

## Wallet spoofing protection
The wallet address is never trusted from client input alone — it is the
address recovered by the ECDSA signature check. Session tokens store the
*verified* address, and `requireActor()` re-reads the associated profile's
role from the database on every request.

The guard also matches the wallet in the signed token to the profile's stored
wallet address on every protected request. Token expiry is enforced server-side
and mirrored by the cookie's `Max-Age`. Production cookies are `HttpOnly`,
`Secure`, and `SameSite=None`; browser calls must use `credentials: "include"`.

Nonce issuance, signature verification, and authenticated session reads are
rate-limited. Invalid JSON and schema violations use the standard 422 envelope;
unauthenticated and unauthorized requests use 401 and 403.

## What is never done
- No seed phrase or private key is ever sent to, or stored by, this backend.
- Sessions are not perpetual: `AUTH_SESSION_TTL_SECONDS` bounds their life.

## Deployment requirements
- Apply `Celo-HaiTi/celoht-supabase/0013_auth_challenges.sql`; this backend does
  not define a duplicate auth table migration.
- Configure server-side `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a
  random `AUTH_SESSION_SECRET` with at least 32 characters.
- Keep `CELO_NETWORK=celoSepolia` and `CELO_CHAIN_ID=11142220` for the pilot.
- In production, configure both Upstash REST variables for shared auth rate
  limiting and allow `https://app.celoht.com` in `CELOHT_ALLOWED_ORIGIN`.
- The frontend must send credentialed requests. Never expose the service-role
  key or session secret in a browser bundle.
