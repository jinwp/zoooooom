// rooms.controller.ts
import {
  Controller, Post, Body, UseGuards, Req, Get, Param, Delete, ForbiddenException
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async create(@Body() dto: CreateRoomDto, @Req() req) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.roomsService.create(dto, userId); // owner id
  }

  // room lookup by meetingCode (public/private info)
  @Get('by-code/:code')
  async getByCode(@Param('code') code: string) {
    return this.roomsService.getByMeetingCode(code);
  }

  @Post('join')
  async join(@Body() dto: JoinRoomDto) {
    return this.roomsService.join(dto);
  }

  // owner deletes room explicitly
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req) {
    const room = await this.roomsService.findById(id);
    const userId = req.user?.sub ?? req.user?.id;
    if (room.ownerUserId !== userId) {
      throw new ForbiddenException('Not the owner');
    }
    return this.roomsService.delete(id);
  }
}
