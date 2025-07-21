// -------------------------------------------------------------------
//  auth/auth.service.ts
// -------------------------------------------------------------------
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService, private readonly users: UsersService) {}

  async validateUser(email: string, pass: string) {
    // Delegated to LocalStrategy; kept for completeness
    return null;
  }

  async login(user: { id: string; email: string; name: string }) {
    const payload = { sub: user.id, email: user.email, name: user.name };
    return {
      accessToken: this.jwt.sign(payload),
      expiresIn: this.jwt.decode(this.jwt.sign(payload))['exp'],
    };
  }
}