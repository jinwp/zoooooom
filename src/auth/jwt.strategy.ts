// src/auth/strategies/jwt.strategy.ts
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // ✅ pick ONE of these lines:
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'), // v10+
      // secretOrKey: config.get<string>('JWT_SECRET') as string, // any version
    });
  }

  // Every successful token parse ends up here
  async validate(payload: JwtPayload) {
    // whatever you return becomes req.user
    return { id: payload.sub, email: payload.email, name: payload.name };
  }
}
