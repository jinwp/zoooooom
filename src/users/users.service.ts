import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;
  constructor(private readonly prisma: PrismaService) {}

  /** Register new account – returns safe user (no hash). */
  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        emoji: dto.emoji,
        avatarUrl: dto.avatarUrl,
        passwordHash,
      },
    });

    return this.strip(user);
  }

  /** Admin / diagnostics */
  async findAll() {
    return (await this.prisma.user.findMany()).map(this.strip);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.strip(user);
  }

  /** Patch user‑editable profile fields */
  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.strip(user);
  }

  async remove(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted' };
  }

  /** Helper for Auth */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  strip = <T extends { passwordHash?: string }>(u: T) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = u;
    return safe;
  };
}
