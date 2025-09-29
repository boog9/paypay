import { IsUUID } from 'class-validator';

export class RotateApiKeyQueryDto {
  @IsUUID()
  storeId!: string;
}
