import { Controller, Post, Get, Param, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { TokenService } from './token.service';
import { LaunchTokenDto } from './dto/launch-token.dto';

@Controller('token')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post('launch')
  @UsePipes(new ValidationPipe({ transform: true }))
  async launch(@Body() dto: LaunchTokenDto) {
    return this.tokenService.launchToken(dto);
  }

  @Get(':mint')
  async getInfo(@Param('mint') mint: string) {
    const token = await this.tokenService.getTokenByMint(mint);
    return {
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      description: token.description,
      imageUrl: token.imageUrl,
      creatorWallet: token.creatorWallet,
      createdAt: token.createdAt,
    };
  }
}
