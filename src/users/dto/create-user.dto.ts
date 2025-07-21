import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(8) password: string;

  @IsOptional() @IsString() emoji?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}
