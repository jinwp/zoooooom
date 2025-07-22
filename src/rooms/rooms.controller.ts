import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  async create(
    @Request() req,
    @Body()
    body: { isPublic: boolean; title?: string; password?: string },
  ) {
    return this.rooms.create(req.user.id, body);
  }

  @Get('public')
  listPublic() {
    return this.rooms.listPublic();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const room = await this.rooms.findByIdentifier(id);
    return room ? this.rooms.strip(room) : null;
  }
}
