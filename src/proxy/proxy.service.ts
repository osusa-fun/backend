import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as bs58 from 'bs58';

@Injectable()
export class ProxyService {
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly configService: ConfigService) {
    const keyHexString = this.configService.get<string>('ENCRYPTION_KEY');
    if (!keyHexString) {
      throw new Error('ENCRYPTION_KEY is not defined in environment');
    }
    this.encryptionKey = Buffer.from(keyHexString, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
  }

  generateProxyKeypair(): Keypair {
    return Keypair.generate();
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.encryptionKey,
      iv,
    ) as crypto.CipherGCM;

    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');

    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new InternalServerErrorException('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      iv,
    ) as crypto.DecipherGCM;

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Helper to encrypt a Keypair's secret key
   */
  encryptKeypair(keypair: Keypair): string {
    const secretKeyBase58 = bs58.default.encode(keypair.secretKey);
    return this.encrypt(secretKeyBase58);
  }

  /**
   * Helper to decrypt a Keypair's secret key
   */
  decryptKeypair(encryptedSecretKey: string): Keypair {
    const decryptedBase58 = this.decrypt(encryptedSecretKey);
    return Keypair.fromSecretKey(bs58.default.decode(decryptedBase58));
  }
}
