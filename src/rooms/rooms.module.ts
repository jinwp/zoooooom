import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { RoomsController } from './rooms.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, UsersModule, JwtModule.register({})],
  providers: [RoomsService, RoomsGateway],
  controllers: [RoomsController],
  exports: [RoomsService],
})
export class RoomsModule {}
