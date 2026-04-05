# AGENT_PROMPT.md — osusa.fun

This document is the primary context file for any AI coding agent working on this codebase. Read this fully before writing any code.

---

## What This Project Is

osusa.fun is a token launchpad built on top of Bags.fm. The core feature is **private revenue sharing**: creators can launch tokens and distribute trading fee revenue to multiple recipients without exposing recipient identities on-chain.

Privacy is achieved through a proxy wallet system:
- Each recipient gets a generated Solana keypair (proxy wallet)
- Bags.fm only sees proxy addresses as fee claimers — not real wallets
- The mapping from proxy to real wallet + BPS is stored encrypted in PostgreSQL
- When recipients claim, the backend forwards SOL from proxy to their real wallet

This project is submitted to the Bags Hackathon under the **Privacy track**.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui |
| Wallet adapter | `@solana/wallet-adapter-react` (Phantom, Backpack) |
| Backend | NestJS (modular), Prisma ORM |
| Database | PostgreSQL |
| Blockchain | `@bagsfm/bags-sdk`, `@solana/web3.js` |
| Crypto | AES-256-GCM for encrypting proxy secret keys at rest |

---

## Project Structure

```
osusa-fun/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── page.tsx            # Landing / explore tokens
│   │   │   ├── launch/
│   │   │   │   └── page.tsx        # Token launch form
│   │   │   ├── claim/
│   │   │   │   └── page.tsx        # Claim dashboard (per wallet)
│   │   │   └── token/[mint]/
│   │   │       └── page.tsx        # Public token detail page
│   │   ├── components/
│   │   │   ├── LaunchForm.tsx      # Multi-step launch form
│   │   │   ├── RecipientConfig.tsx # Add recipients + BPS
│   │   │   └── ClaimCard.tsx       # Per-token claim UI
│   │   └── lib/
│   │       └── api.ts              # Typed fetch wrappers for backend
│   └── api/                        # NestJS backend
│       ├── src/
│       │   ├── app.module.ts
│       │   ├── token/
│       │   │   ├── token.module.ts
│       │   │   ├── token.controller.ts
│       │   │   ├── token.service.ts
│       │   │   └── dto/
│       │   │       └── launch-token.dto.ts
│       │   ├── claim/
│       │   │   ├── claim.module.ts
│       │   │   ├── claim.controller.ts
│       │   │   └── claim.service.ts
│       │   ├── proxy/
│       │   │   ├── proxy.module.ts
│       │   │   └── proxy.service.ts   # Keypair generation + encryption
│       │   └── prisma/
│       │       └── prisma.service.ts
│       └── prisma/
│           └── schema.prisma
└── packages/
    └── shared/
        └── types.ts                # Shared DTOs between web and api
```

---

## Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Token {
  id             String      @id @default(cuid())
  mint           String      @unique
  name           String
  symbol         String
  description    String?
  imageUrl       String?
  creatorWallet  String
  bagsConfigKey  String
  createdAt      DateTime    @default(now())
  recipients     Recipient[]
}

model Recipient {
  id             String   @id @default(cuid())
  tokenMint      String
  token          Token    @relation(fields: [tokenMint], references: [mint])
  proxyPubkey    String   @unique
  realPubkey     String   // AES-256-GCM encrypted
  bps            Int      // basis points, sum across all recipients must equal 10000
  secretKey      String   // AES-256-GCM encrypted base58 keypair secret
  totalClaimed   BigInt   @default(0)
  createdAt      DateTime @default(now())
}
```

---

## Environment Variables

```env
# apps/api/.env
DATABASE_URL=postgresql://localhost:5432/osusa
BAGS_API_KEY=your_bags_api_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PLATFORM_KEYPAIR=base58_encoded_platform_keypair
ENCRYPTION_KEY=32_byte_hex_string_for_aes256

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
```

---

## API Contracts

### POST /token/launch

**Request body:**
```typescript
{
  name: string
  symbol: string
  description: string
  imageUrl: string
  creatorWallet: string        // base58 pubkey of the creator
  initialBuyLamports: number   // optional, 0 if no initial buy
  recipients: Array<{
    realWallet: string         // base58 pubkey of actual recipient
    bps: number                // must sum to 10000 across all recipients including creator
  }>
}
```

**What the backend does:**
1. Validate BPS sum equals 10000
2. Generate a `Keypair` for each recipient (proxy wallet)
3. Encrypt each proxy secret key with AES-256-GCM using `ENCRYPTION_KEY`
4. Call `sdk.tokenLaunch.createTokenInfoAndMetadata()`
5. Build `feeClaimers` array using proxy pubkeys + BPS
6. Call `sdk.config.createBagsFeeShareConfig()` with proxy wallets
7. Call `sdk.tokenLaunch.createLaunchTransaction()`
8. Sign and broadcast the transaction
9. Save `Token` + `Recipient[]` records to DB
10. Return `{ mint, bagsConfigKey, recipients: [{ proxyPubkey, bps }] }` — never return real wallets

**Response:**
```typescript
{
  mint: string
  bagsConfigKey: string
  txSignature: string
}
```

---

### GET /token/:mint

Returns public token info. Never expose `realPubkey` or `secretKey` fields.

**Response:**
```typescript
{
  mint: string
  name: string
  symbol: string
  description: string
  imageUrl: string
  creatorWallet: string
  createdAt: string
}
```

---

### GET /claim/pending?wallet=:pubkey

Returns all tokens where this wallet is a recipient, and the claimable SOL amount per token.

**What the backend does:**
1. Look up all `Recipient` records where `realPubkey` (decrypted) matches `wallet`
2. For each match, call `sdk.fee.getAllClaimablePositions(proxyPubkey)`
3. Sum up `totalClaimableLamportsUserShare` per token
4. Return the list

**Response:**
```typescript
Array<{
  tokenMint: string
  tokenName: string
  tokenSymbol: string
  claimableLamports: string   // BigInt as string
  bps: number
}>
```

---

### POST /claim/execute

**Request body:**
```typescript
{
  tokenMint: string
  walletPubkey: string     // real wallet claiming
  signedMessage: string    // base64 — proof of wallet ownership
  message: string          // the challenge message that was signed
}
```

**What the backend does:**
1. Verify `signedMessage` is a valid signature of `message` by `walletPubkey`
2. Look up `Recipient` where `realPubkey` matches `walletPubkey` and `tokenMint` matches
3. Decrypt `secretKey` to get proxy keypair
4. Call `sdk.fee.getAllClaimablePositions(proxyPubkey)` and filter for this token
5. Call `sdk.fee.getClaimTransaction()` for each position, sign as proxy, broadcast
6. Wait for SOL to land in proxy wallet
7. Transfer SOL from proxy to `walletPubkey` via system program (keep ~5000 lamports for rent)
8. Update `totalClaimed` in DB
9. Return tx signature

**Response:**
```typescript
{
  txSignature: string
  claimedLamports: string
}
```

---

## Critical Implementation Rules

**BPS validation**
Always validate that the sum of all recipient BPS equals exactly 10000. Reject the request if not. The creator must be included as a recipient explicitly.

**Encryption**
Never store `realPubkey` or `secretKey` in plaintext. Use AES-256-GCM. The `ENCRYPTION_KEY` env var is the key. Store the IV alongside the ciphertext (e.g. `iv:ciphertext` as a single string).

**Never expose private data**
The following fields must never appear in any API response or log:
- `realPubkey` (decrypted)
- `secretKey` (decrypted or encrypted)
- Any mapping between proxy and real wallet

**Bags SDK usage**
Always initialize the SDK like this:
```typescript
import { BagsSDK } from '@bagsfm/bags-sdk'
import { Connection } from '@solana/web3.js'

const connection = new Connection(process.env.SOLANA_RPC_URL)
const sdk = new BagsSDK(process.env.BAGS_API_KEY, connection, 'processed')
```

**Fee claimers array**
When building `feeClaimers` for `createBagsFeeShareConfig`, the array must:
- Include creator as an explicit entry with their BPS
- Use proxy pubkeys for all recipients
- Have BPS values sum to exactly 10000
- Have maximum 100 entries total

**Wallet auth (claim flow)**
Use `nacl.sign.detached.verify` from `tweetnacl` to verify signed messages. The challenge message should include the wallet pubkey and a timestamp to prevent replay attacks.

```typescript
import nacl from 'tweetnacl'
import bs58 from 'bs58'

const messageBytes = new TextEncoder().encode(message)
const signatureBytes = bs58.decode(signedMessage)
const pubkeyBytes = bs58.decode(walletPubkey)

const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes)
```

**SOL transfer from proxy**
After claim, transfer SOL from proxy to real wallet using system program. Leave 5000 lamports in proxy for rent:

```typescript
import { SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'

const balance = await connection.getBalance(proxyKeypair.publicKey)
const transferAmount = balance - 5000

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: proxyKeypair.publicKey,
    toPubkey: new PublicKey(realWallet),
    lamports: transferAmount,
  })
)

await sendAndConfirmTransaction(connection, tx, [proxyKeypair])
```

---

## What NOT to Build

- No custom Anchor/Solana program — not needed for MVP
- No ZK proofs — out of scope
- No token trading UI — Bags handles that
- No token price charts — use Bags or Birdeye for that
- No admin dashboard — out of scope for hackathon

Focus only on: launch form, recipient config, claim dashboard, and the backend services that power them.

---

## Current Status

All files are scaffolded. Nothing is implemented yet. Start from the backend and work forward:

1. `ProxyService` — keypair generation and encryption/decryption
2. `TokenService` — Bags SDK integration for launch
3. `ClaimService` — Bags SDK integration for claim + SOL forwarding
4. Frontend launch form
5. Frontend claim dashboard

---

## References

- Bags API docs: https://docs.bags.fm
- Bags SDK launch guide: https://docs.bags.fm/how-to-guides/launch-token
- Bags SDK claim guide: https://docs.bags.fm/how-to-guides/claim-fees
- Bags fee structures: https://docs.bags.fm/how-to-guides/customize-token-fees
- `@solana/web3.js` docs: https://solana-labs.github.io/solana-web3.js/