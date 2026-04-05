import { Injectable, BadRequestException, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagsSDK } from '@bagsfm/bags-sdk';
import { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { PrismaService } from '../prisma/prisma.service';
import { ProxyService } from '../proxy/proxy.service';
import { ClaimDto } from './dto/claim.dto';
import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';

@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);
  private readonly sdk: BagsSDK;
  private readonly connection: Connection;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly proxyService: ProxyService,
  ) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    const apiKey = this.configService.get<string>('BAGS_API_KEY');

    if (!rpcUrl || !apiKey) {
      throw new Error('Missing required environment variables for ClaimService');
    }

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.sdk = new BagsSDK(apiKey, this.connection, 'processed');
  }

  async getPendingClaims(walletPubkey: string) {
    const recipients = await (this.prisma as any).recipient.findMany({
      include: { token: true }
    });

    const pendingClaims: any[] = [];

    for (const recipient of recipients) {
      try {
        const decryptedRealPubkey = this.proxyService.decrypt(recipient.realPubkey);
        if (decryptedRealPubkey === walletPubkey) {
          const proxyPubkey = new PublicKey(recipient.proxyPubkey);
          const positions = await this.sdk.fee.getAllClaimablePositions(proxyPubkey);
          
          // Filter for the specific token mint (baseMint is string in the SDK types)
          const tokenPositions = positions.filter(p => (p as any).baseMint === recipient.tokenMint);
          const claimableLamports = tokenPositions.reduce((sum, p) => sum + BigInt(p.totalClaimableLamportsUserShare.toString()), BigInt(0));

          if (claimableLamports > BigInt(0)) {
            pendingClaims.push({
              tokenMint: recipient.tokenMint,
              tokenName: recipient.token.name,
              tokenSymbol: recipient.token.symbol,
              claimableLamports: claimableLamports.toString(),
              bps: recipient.bps,
            });
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to decrypt or fetch claims for recipient ${recipient.id}: ${e.message}`);
      }
    }

    return pendingClaims;
  }

  async executeClaim(dto: ClaimDto) {
    const { tokenMint, walletPubkey, signedMessage, message } = dto;

    // 1. Verify Authentication
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.default.decode(signedMessage);
    const pubkeyBytes = bs58.default.decode(walletPubkey);

    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
    if (!isValid) {
      throw new UnauthorizedException('Invalid wallet signature');
    }

    // 2. Look up Recipient record
    const recipients = await (this.prisma as any).recipient.findMany({
      where: { tokenMint },
    });

    let targetRecipient: any = null;
    for (const r of recipients) {
      if (this.proxyService.decrypt(r.realPubkey) === walletPubkey) {
        targetRecipient = r;
        break;
      }
    }

    if (!targetRecipient) {
      throw new BadRequestException('Recipient not found for this wallet and token');
    }

    try {
      // 3. Decrypt Proxy Keypair
      const proxyKeypair = this.proxyService.decryptKeypair(targetRecipient.secretKey);

      // 4. Get claimable positions
      const positions = await this.sdk.fee.getAllClaimablePositions(proxyKeypair.publicKey);
      const tokenPosition = positions.find(p => (p as any).baseMint === tokenMint);

      if (!tokenPosition || BigInt(tokenPosition.totalClaimableLamportsUserShare.toString()) === BigInt(0)) {
        throw new BadRequestException('No claimable fees for this token');
      }

      // 5. Execute Claim from Bags
      // getClaimTransaction returns an array of Transactions in v1.3.1
      const claimTransactions = await this.sdk.fee.getClaimTransaction(proxyKeypair.publicKey, tokenPosition);
      let claimTxSignature = '';
      for (const tx of claimTransactions) {
        claimTxSignature = await sendAndConfirmTransaction(this.connection, tx, [proxyKeypair]);
      }
      this.logger.log(`Claimed from Bags for proxy ${proxyKeypair.publicKey.toBase58()}, last tx: ${claimTxSignature}`);

      // 6. Forward SOL to Real Wallet
      const balance = await this.connection.getBalance(proxyKeypair.publicKey);
      const rentReserve = 5000000; // 0.005 SOL reserve for rent
      
      if (balance > rentReserve) {
        const transferAmount = balance - rentReserve;
        const forwardTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: proxyKeypair.publicKey,
            toPubkey: new PublicKey(walletPubkey),
            lamports: transferAmount,
          })
        );

        const forwardTxSignature = await sendAndConfirmTransaction(this.connection, forwardTx, [proxyKeypair]);
        this.logger.log(`Forwarded ${transferAmount} lamports to real wallet ${walletPubkey}, tx: ${forwardTxSignature}`);

        // 7. Update DB
        await (this.prisma as any).recipient.update({
          where: { id: targetRecipient.id },
          data: {
            totalClaimed: {
              increment: transferAmount
            }
          }
        });

        return {
          txSignature: forwardTxSignature,
          claimedLamports: transferAmount.toString(),
        };
      } else {
        throw new BadRequestException('Insufficient balance in proxy wallet to forward fees after claim');
      }

    } catch (error) {
      this.logger.error('Claim execution failed', error);
      throw new InternalServerErrorException(error.message || 'Claim execution failed');
    }
  }
}
