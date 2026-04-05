import { IsString, IsNotEmpty } from 'class-validator';

export class ClaimDto {
  @IsString()
  @IsNotEmpty()
  tokenMint: string;

  @IsString()
  @IsNotEmpty()
  walletPubkey: string; // real wallet claiming

  @IsString()
  @IsNotEmpty()
  signedMessage: string; // base64 — proof of wallet ownership

  @IsString()
  @IsNotEmpty()
  message: string; // the challenge message that was signed
}
