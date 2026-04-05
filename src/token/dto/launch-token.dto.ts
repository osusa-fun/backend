import { IsString, IsArray, IsNumber, ValidateNested, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class RecipientDto {
  @IsString()
  realWallet: string;

  @IsNumber()
  @Min(1)
  @Max(10000)
  bps: number;
}

export class LaunchTokenDto {
  @IsString()
  name: string;

  @IsString()
  symbol: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  creatorWallet: string;

  @IsNumber()
  @IsOptional()
  initialBuyLamports?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];
}
