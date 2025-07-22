// rooms.service.ts
import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRoomDto, ownerUserId: string) {
    // ensure meetingCode unique
    if (!ownerUserId) throw new BadRequestException('owner missing');
    const exists = await this.prisma.room.findUnique({ where: { meetingCode: dto.meetingCode } });
    if (exists) throw new BadRequestException('meetingCode already exists');

    let joinPasswordHash: string | undefined;
    if (!dto.isPublic && dto.joinPassword) {
      joinPasswordHash = await bcrypt.hash(dto.joinPassword, 10);
    }

    try {
      return await this.prisma.room.create({
        data: {
          meetingCode: dto.meetingCode,
          title: dto.title ?? null,
          isPublic: dto.isPublic,
          joinPasswordHash,
          owner: { connect: { id: ownerUserId } },
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('meetingCode already exists');
      }
      throw e;
    }
  }

  async getByMeetingCode(code: string) {
    const room = await this.prisma.room.findUnique({ where: { meetingCode: code } });
    if (!room) throw new NotFoundException('Room not found');
    // expose minimal info
    return {
      id: room.id,
      isPublic: room.isPublic,
      title: room.title,
    };
  }

  async join(dto: JoinRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { meetingCode: dto.meetingCode } });
    if (!room) throw new NotFoundException('Room not found');

    if (!room.isPublic) {
      if (!dto.password) throw new UnauthorizedException('Password required');
      const ok = await bcrypt.compare(dto.password, room.joinPasswordHash ?? '');
      if (!ok) throw new UnauthorizedException('Wrong password');
    }
    return { id: room.id };
  }

  async findById(id: string) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async delete(id: string) {
    // Hard delete:
    return this.prisma.room.delete({ where: { id } });

    // Or soft delete:
    // return this.prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
