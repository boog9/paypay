import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RescanWalletBodyDto {
  @Transform(({ value }) => {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'string' && value.trim() === '') return 0;
    return Number(value);
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  startIndex = 0;

  @Transform(({ value }) => {
    if (value === undefined || value === null) return 10_000;
    if (typeof value === 'string' && value.trim() === '') return 10_000;
    return Number(value);
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  gapLimit = 10_000;

  @Transform(({ value }) => {
    if (value === undefined || value === null) return 3_000;
    if (typeof value === 'string' && value.trim() === '') return 3_000;
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  batchSize = 3_000;
}

export class ConfirmDangerousActionDto {
  @IsString()
  @IsOptional()
  confirmation?: string;
}
