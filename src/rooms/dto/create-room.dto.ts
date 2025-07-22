import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  meetingCode: string; // from frontend

  @IsString()
  @IsOptional()
  title?: string;

  @IsBoolean()
  isPublic: boolean;

  @IsString()
  @IsOptional()
  joinPassword?: string; // plain text from FE, hash it in service
}
