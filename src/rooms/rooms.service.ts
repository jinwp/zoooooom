import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export interface CreateRoomOptions {
  title?: string;
  isPublic: boolean;
  password?: string; // plain text ↦ will be hashed
}

// TOP of file
import { Room } from '@prisma/client';

@Injectable()
export class RoomsService {
  private readonly SALT_ROUNDS = 12;
  constructor(private readonly prisma: PrismaService) {}

  // ✅ accept null/undefined
  async verifyPassword(room: Pick<Room, 'joinPasswordHash'>, password: string) {
    if (!room.joinPasswordHash) return true;
    return bcrypt.compare(password, room.joinPasswordHash);
  }

  // ✅ make it PUBLIC and concrete (no generics), allow null
  public strip(room: Room): Omit<Room, 'joinPasswordHash'> {
    const { joinPasswordHash, ...safe } = room;
    return safe;
  }

  async create(ownerId: string, opts: CreateRoomOptions) {
    const meetingCode = opts.isPublic ? null : randomBytes(4).toString('hex');
    const room = await this.prisma.room.create({
      data: {
        ownerUserId: ownerId,
        isPublic: opts.isPublic,
        title: opts.title,
        meetingCode,
        joinPasswordHash: opts.isPublic
          ? null
          : await bcrypt.hash(opts.password ?? '', this.SALT_ROUNDS),
      },
    });
    return this.strip(room); // ✅
  }

  async listPublic() {
    const rooms = await this.prisma.room.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return rooms.map((r) => this.strip(r)); // ✅ no this.strip binding issue
  }

  async findByIdentifier(idOrCode: string) {
    return this.prisma.room.findFirst({
      where: { OR: [{ id: idOrCode }, { meetingCode: idOrCode }] },
    });
  }

  async closeRoom(roomId: string) {
    await this.prisma.room.update({
      where: { id: roomId },
      data: { isActive: false, endedAt: new Date() },
    });
  }
}
