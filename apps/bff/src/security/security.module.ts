import { Module } from '@nestjs/common';
import { EnvelopeEncryptionService } from './envelope-encryption.service';

@Module({
  providers: [EnvelopeEncryptionService],
  exports: [EnvelopeEncryptionService]
})
export class SecurityModule {}
