import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProxyModule } from './proxy/proxy.module';
import { TokenModule } from './token/token.module';
import { ClaimModule } from './claim/claim.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, ProxyModule, TokenModule, ClaimModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
