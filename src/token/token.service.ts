import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BagsSDK } from '@bagsfm/bags-sdk';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { PrismaService } from '../prisma/prisma.service';
import { ProxyService } from '../proxy/proxy.service';
import { LaunchTokenDto } from './dto/launch-token.dto';
import * as bs58 from 'bs58';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly sdk: BagsSDK;
  private readonly connection: Connection;
  private readonly platformKeypair: Keypair;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly proxyService: ProxyService,
  ) {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL');
    const apiKey = this.configService.get<string>('BAGS_API_KEY');
    const platformSecret = this.configService.get<string>('PLATFORM_KEYPAIR');

    if (!rpcUrl || !apiKey || !platformSecret) {
      throw new Error('Missing required environment variables for TokenService');
    }

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.sdk = new BagsSDK(apiKey, this.connection, 'processed');
    this.platformKeypair = Keypair.fromSecretKey(bs58.default.decode(platformSecret));
  }

  async launchToken(dto: LaunchTokenDto) {
    const { name, symbol, description, imageUrl, creatorWallet, recipients, initialBuyLamports } = dto;

    // 1. Validate BPS sum equals 10000
    const totalBps = recipients.reduce((sum, r) => sum + r.bps, 0);
    if (totalBps !== 10000) {
      throw new BadRequestException('Total BPS must equal exactly 10000');
    }

    try {
      // 2. Generate proxy wallets
      const proxyRecipients = recipients.map((r) => ({
        ...r,
        proxyKeypair: this.proxyService.generateProxyKeypair(),
      }));

      // 3. Create Token Info & Metadata
      // In SDK 1.3.1, this takes one object and returns tokenMint as a string
      const response = await this.sdk.tokenLaunch.createTokenInfoAndMetadata({
        name,
        symbol,
        description: description || '',
        imageUrl: imageUrl || '',
      });

      const tokenMint = new PublicKey(response.tokenMint);

      // 4. Create Bags Fee Share Config
      const feeClaimers = proxyRecipients.map((pr) => ({
        user: pr.proxyKeypair.publicKey,
        userBps: pr.bps,
      }));

      // Returns transactions array and meteoraConfigKey
      const configResult = await this.sdk.config.createBagsFeeShareConfig({
        payer: this.platformKeypair.publicKey,
        baseMint: tokenMint,
        feeClaimers,
      });

      const meteoraConfigKey = configResult.meteoraConfigKey;
      const configTxs = configResult.transactions;

      // 5. Create Launch Transaction
      const launchTransaction = await this.sdk.tokenLaunch.createLaunchTransaction({
        metadataUrl: response.tokenMetadata,
        tokenMint: tokenMint,
        launchWallet: this.platformKeypair.publicKey,
        initialBuyLamports: initialBuyLamports || 0,
        configKey: meteoraConfigKey,
      });

      // 6. Sign and Broadcast Transactions
      this.logger.log(`Broadcasting ${configTxs.length} config transactions...`);
      for (const tx of configTxs) {
        tx.sign([this.platformKeypair]);
        const sig = await this.connection.sendRawTransaction(tx.serialize());
        await this.connection.confirmTransaction(sig, 'confirmed');
      }
      
      this.logger.log('Broadcasting launch transaction...');
      launchTransaction.sign([this.platformKeypair]);
      const txSignature = await this.connection.sendRawTransaction(launchTransaction.serialize());
      await this.connection.confirmTransaction(txSignature, 'confirmed');

      // 7. Save to Database
      await (this.prisma as any).$transaction(async (tx: any) => {
        const token = await tx.token.create({
          data: {
            mint: tokenMint.toBase58(),
            name,
            symbol,
            description,
            imageUrl,
            creatorWallet,
            bagsConfigKey: meteoraConfigKey.toBase58(),
          },
        });

        await tx.recipient.createMany({
          data: proxyRecipients.map((pr) => ({
            tokenMint: token.mint,
            proxyPubkey: pr.proxyKeypair.publicKey.toBase58(),
            realPubkey: this.proxyService.encrypt(pr.realWallet),
            bps: pr.bps,
            secretKey: this.proxyService.encryptKeypair(pr.proxyKeypair),
          })),
        });
      });

      return {
        mint: tokenMint.toBase58(),
        bagsConfigKey: meteoraConfigKey.toBase58(),
        txSignature,
      };

    } catch (error) {
      this.logger.error('Failed to launch token', error);
      throw new InternalServerErrorException(error.message || 'Failed to launch token');
    }
  }

  async getTokenByMint(mint: string) {
    const token = await (this.prisma as any).token.findUnique({
      where: { mint },
    });
    if (!token) throw new BadRequestException('Token not found');
    return token;
  }
}
