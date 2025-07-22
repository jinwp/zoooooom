import { IsString, IsOptional } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  meetingCode: string;

  @IsString()
  @IsOptional()
  password?: string;
}
