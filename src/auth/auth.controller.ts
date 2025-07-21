// -------------------------------------------------------------------
//  auth/auth.controller.ts
// -------------------------------------------------------------------
import { Controller, Post, UseGuards, Request, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  /** POST /auth/signup */
  @Post('signup')
  async signup(@Body() dto: CreateUserDto) {
    const user = await this.users.create(dto);
    return this.auth.login(user as any); // immediate login after sign‑up
  }

  /** POST /auth/login */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Body() _dto: LoginDto) {
    // `req.user` comes from LocalStrategy
    return this.auth.login(req.user);
  }
}