# osusa.fun — PROJECT.md

## Overview

osusa.fun is a token launchpad built on top of Bags.fm with private revenue sharing. Creators can launch tokens and distribute trading fee revenue to multiple recipients without exposing recipient identities on-chain. The privacy is achieved via a proxy wallet system: on-chain, only generated proxy addresses are visible as fee claimers; the mapping from proxy to real wallet is stored exclusively in the backend database.

This project is submitted to the **Bags Hackathon** under the **Privacy track**.

---

## Problem

When a creator launches a token on Bags, the fee sharing configuration is stored on-chain. Anyone who knows the token mint address can derive the fee share config PDA and read the full list of claimers and their BPS allocations. This creates a transparency problem for:

- Anonymous collaborators who do not want their wallet linked to a token
- Influencers or KOLs with semi-public personas who want revenue but not attribution
- Teams with internal equity splits they want to keep confidential

---

## Solution

osusa.fun introduces a proxy wallet layer between the creator's intent and the on-chain state:

1. Creator fills in recipients and their percentage splits in the platform UI
2. Backend generates a fresh Solana keypair (proxy wallet) for each recipient
3. These proxy wallets are registered as fee claimers on Bags — on-chain data shows only anonymous addresses
4. The mapping from proxy wallet to real wallet + BPS is stored in the platform's encrypted database
5. When a recipient wants to claim, they authenticate with their real wallet, the backend forwards SOL from the proxy to their wallet

No one observing the chain can determine who is receiving fees or what their share is.

---

## Hackathon Track

**Track**: Privacy  
**Hackathon**: The Bags Hackathon (DoraHacks)  
**Prize pool**: $1M in grants for 100 teams

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui |
| Wallet | Solana wallet adapter (Phantom, Backpack support) |
| Backend | NestJS, Prisma ORM |
| Database | PostgreSQL |
| Blockchain | Bags TypeScript SDK, `@solana/web3.js` |
| Proxy wallets | `Keypair.generate()` per recipient, stored encrypted in DB |

---

## Architecture

### Components

```
Frontend (Next.js)
    └── Token launch form
    └── Revenue sharing config (recipients + % splits)
    └── Claim dashboard (per-wallet claimable amount)

Backend (NestJS)
    └── /token/launch        — orchestrates Bags API + proxy generation
    └── /token/claim         — verifies identity, forwards SOL from proxy
    └── /token/:mint/info    — returns public token info (no private data)

Database (PostgreSQL)
    └── tokens               — token_mint, creator, metadata, bags_config_key
    └── recipients           — token_mint, proxy_pubkey, real_pubkey (encrypted), bps
    └── proxy_keypairs       — proxy_pubkey, encrypted_secret_key

Solana (on-chain via Bags)
    └── Bags fee share config PDA (only proxy wallets visible)
    └── Virtual pool + DAMM V2 pool (post-graduation)
```

### Launch Flow

```
User submits form
    → Backend generates N proxy keypairs (one per recipient)
    → Backend calls Bags SDK: createBagsFeeShareConfig (fee claimers = proxies)
    → Backend calls Bags SDK: createLaunchTransaction
    → Token is launched; on-chain state shows proxy addresses only
    → Backend saves proxy → real wallet + BPS mapping to DB
    → User receives token mint address and their own share percentage
```

### Claim Flow

```
User clicks claim on dashboard
    → User signs a challenge message with their real wallet (auth)
    → Backend looks up proxy wallet(s) for this real wallet + token
    → Backend calls Bags SDK: getClaimTransaction (signed as proxy)
    → SOL lands in proxy wallet from Bags
    → Backend transfers SOL from proxy to real wallet (system program transfer)
    → User receives SOL; proxy wallet is swept back to zero
```

---

## Privacy Model

| Data | Visibility |
|---|---|
| Token mint address | Public |
| Proxy wallet addresses | Public (on-chain, Bags config) |
| BPS per proxy | Public (on-chain) |
| Real wallet per proxy | Private (backend DB only) |
| BPS per real wallet | Private (backend DB only) |
| Total fee revenue per token | Public (Bags API) |

The privacy guarantee is that **no on-chain data links a proxy address to a real identity**. The trust model is semi-custodial: recipients trust the platform to correctly calculate and forward their share, and to not expose the mapping. This is an explicit design tradeoff accepted for the hackathon scope.

---

## Key Limitations (MVP Scope)

- Proxy secret keys are stored server-side (encrypted). A compromised backend can expose mappings.
- No ZK proof of correct distribution — recipients trust the platform's math.
- Claim flow requires the backend to be online and hold temporary custody of SOL during forwarding.
- Recipient list is fixed at token launch time (Bags limitation: fee share config is immutable post-launch).

---

## Directory Structure

```
osusa-fun/
├── apps/
│   ├── web/                  # Next.js frontend
│   │   ├── app/
│   │   │   ├── launch/       # Token launch page
│   │   │   ├── claim/        # Claim dashboard
│   │   │   └── token/[mint]/ # Token detail page
│   │   └── components/
│   └── api/                  # NestJS backend
│       ├── src/
│       │   ├── token/        # Token launch module
│       │   ├── claim/        # Claim module
│       │   ├── proxy/        # Proxy wallet management
│       │   └── prisma/       # Prisma service
│       └── prisma/
│           └── schema.prisma
├── packages/
│   └── shared/               # Shared types
└── README.md
```

---

## Database Schema (Prisma)

```prisma
model Token {
  id             String       @id @default(cuid())
  mint           String       @unique
  name           String
  symbol         String
  creatorWallet  String
  bagsConfigKey  String
  createdAt      DateTime     @default(now())
  recipients     Recipient[]
}

model Recipient {
  id              String  @id @default(cuid())
  tokenMint       String
  token           Token   @relation(fields: [tokenMint], references: [mint])
  proxyPubkey     String  @unique
  realPubkey      String  // encrypted at rest
  bps             Int
  proxySecretKey  String  // encrypted at rest
  totalClaimed    BigInt  @default(0)
}
```

---

## Environment Variables

```env
# Backend
DATABASE_URL=postgresql://...
BAGS_API_KEY=your_bags_api_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PLATFORM_KEYPAIR=...         # Platform authority keypair (base58)
ENCRYPTION_KEY=...           # AES-256 key for encrypting proxy secrets

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
```

---

## Milestones

- [ ] Backend: proxy wallet generation + DB storage
- [ ] Backend: Bags API integration (launch + fee share config)
- [ ] Backend: claim endpoint with SOL forwarding
- [ ] Frontend: token launch form with recipient config
- [ ] Frontend: claim dashboard
- [ ] Frontend: wallet auth (sign message)
- [ ] End-to-end test on devnet
- [ ] Deploy to mainnet