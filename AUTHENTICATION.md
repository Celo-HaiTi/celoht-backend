# AUTHENTICATION.md — Wallet Sign-In Flow

```
POST /api/v1/auth/nonce   { walletAddress }
  -> { message, nonce, expiresAt }         (nonce stored server-side, unused, TTL-bound)

Client signs `message` with the wallet's private key (never sent to the backend)

POST /api/v1/auth/verify  { walletAddress, nonce, signature }
  -> verify signature (viem.verifyMessage)
  -> atomically consume the nonce (fails if reused/expired/unknown)
  -> find-or-create profiles row
  -> issue HMAC-signed session token, set as httpOnly cookie
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

## What is never done
- No seed phrase or private key is ever sent to, or stored by, this backend.
- Sessions are not perpetual: `AUTH_SESSION_TTL_SECONDS` bounds their life.
