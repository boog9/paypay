import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class RescanWalletBodyDto {
  @Transform(({ value }) => (value === undefined ? 0 : Number(value)))
  @IsInt()
  @Min(0)
  @IsOptional()
  startingIndex = 0;

  @Transform(({ value }) => (value === undefined ? 10_000 : Number(value)))
  @IsInt()
  @Min(0)
  @IsOptional()
  gapLimit = 10_000;

  @Transform(({ value }) => (value === undefined ? 3_000 : Number(value)))
  @IsInt()
  @Min(1)
  @IsOptional()
  batchSize = 3_000;
}

export class ConfirmDangerousActionDto {
  confirmation?: string;
}
