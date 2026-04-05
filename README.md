# osusa.fun

> Token launchpad on Bags.fm with private revenue sharing

osusa.fun lets creators launch tokens and distribute trading fee revenue to multiple recipients — without exposing who gets paid or how much, on-chain.

Built for the [Bags Hackathon](https://bags.fm/hackathon) · Privacy track.

---

## The Problem

Every token launched on Bags has a fee share config stored on-chain. Anyone can read it. If you want to split revenue with a silent co-founder, an anonymous contributor, or an influencer who wants plausible deniability — there's no clean way to do that today.

## What osusa.fun Does

You launch a token. You set who gets what percentage. We handle the rest — without putting anyone's real wallet on-chain.

On-chain, Bags only sees anonymous proxy addresses as fee claimers. The real mapping lives in our backend, encrypted. Recipients claim their SOL by authenticating with their real wallet — no one else can see their share or even know they're involved.

---

## How It Works

### Launching a token

1. Fill in your token details (name, symbol, image, description)
2. Add revenue recipients — paste their wallet addresses and set percentages
3. Sign and launch

Behind the scenes, we generate a fresh Solana keypair (proxy wallet) for each recipient. These proxies become the fee claimers on Bags. On-chain, nobody knows who they belong to.

### Claiming fees

1. Connect your wallet to osusa.fun
2. See your pending claimable SOL across all tokens you're a recipient of
3. Click claim — we verify your identity, collect from Bags, and send you your cut

---

## Privacy Model

| What | Who can see it |
|---|---|
| Token exists | Everyone |
| Fee claimers (proxy addresses) | Everyone (on-chain) |
| Who the proxies belong to | Nobody except osusa.fun |
| Your share percentage | Nobody except you and osusa.fun |
| Your total earnings | Nobody except you |

The privacy guarantee: no on-chain data links a proxy wallet to a real identity. We store the mapping in an encrypted database. We never expose it.

---

## Tech Stack

- **Frontend** — Next.js 14, Tailwind CSS, Solana wallet adapter
- **Backend** — NestJS, Prisma
- **Database** — PostgreSQL
- **Blockchain** — Bags TypeScript SDK, `@solana/web3.js`

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- A Bags API key from [dev.bags.fm](https://dev.bags.fm)
- A Solana wallet with SOL (for transaction fees)

### Install

```bash
git clone https://github.com/yourname/osusa-fun
cd osusa-fun
npm install
```

### Configure

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Fill in your environment variables:

```env
# apps/api/.env
DATABASE_URL=postgresql://localhost:5432/osusa
BAGS_API_KEY=your_api_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PLATFORM_KEYPAIR=your_base58_keypair
ENCRYPTION_KEY=your_32_byte_aes_key
```

### Database setup

```bash
cd apps/api
npx prisma migrate dev
```

### Run

```bash
# Run both frontend and backend
npm run dev
```

Frontend runs on `http://localhost:3000`  
Backend runs on `http://localhost:3001`

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/token/launch` | Launch a new token with recipient config |
| `GET` | `/token/:mint` | Get public token info |
| `GET` | `/claim/pending` | Get claimable amounts for connected wallet |
| `POST` | `/claim/execute` | Execute claim for a specific token |

---

## Architecture Notes

**Why proxy wallets and not ZK?**

ZK proofs of correct distribution on Solana are possible but complex to build in a hackathon timeframe. Proxy wallets give us a practical privacy layer that's easy to reason about and audit. The tradeoff is that recipients trust the platform to correctly forward their share — we're semi-custodial.

**Why no custom Anchor program?**

For this MVP, we don't need one. Bags handles fee accumulation and distribution to the proxy wallets. The platform backend handles the forwarding from proxy to real wallet via standard system program transfers. A custom program would add on-chain verifiability of the split logic — a good post-hackathon improvement.

**Bags fee structure**

Bags distributes creator fees as SOL (lamports) — not SPL tokens. This simplifies the claim flow since we don't need to handle Associated Token Accounts for each recipient.

---

## Roadmap

**Hackathon MVP**
- Token launch with private recipient config
- Claim dashboard
- Proxy wallet system

**Post-hackathon**
- On-chain distribution via Anchor program (remove custodial trust)
- ZK proof of correct BPS calculation
- Recipient list update mechanism (currently locked at launch)
- Multi-sig platform authority

---

## License

MIT