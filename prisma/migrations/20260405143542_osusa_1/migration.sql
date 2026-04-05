-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "creatorWallet" TEXT NOT NULL,
    "bagsConfigKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "proxyPubkey" TEXT NOT NULL,
    "realPubkey" TEXT NOT NULL,
    "bps" INTEGER NOT NULL,
    "secretKey" TEXT NOT NULL,
    "totalClaimed" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_mint_key" ON "Token"("mint");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_proxyPubkey_key" ON "Recipient"("proxyPubkey");

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "Token"("mint") ON DELETE RESTRICT ON UPDATE CASCADE;
