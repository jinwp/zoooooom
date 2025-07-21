// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';   // if you use PrismaService

@Module({
  imports: [PrismaModule],          // ← whatever UsersService needs
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],          //  ❗️ make it available to other modules
})
export class UsersModule {}