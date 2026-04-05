import { Controller, Post, Get, Query, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { ClaimService } from './claim.service';
import { ClaimDto } from './dto/claim.dto';

@Controller('claim')
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Get('pending')
  async getPending(@Query('wallet') wallet: string) {
    if (!wallet) return [];
    return this.claimService.getPendingClaims(wallet);
  }

  @Post('execute')
  @UsePipes(new ValidationPipe({ transform: true }))
  async execute(@Body() dto: ClaimDto) {
    return this.claimService.executeClaim(dto);
  }
}
