import { Global, Module } from '@nestjs/common';
import { EnvelopeEncryptionService } from './envelope-encryption.service';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';

@Global()
@Module({
  providers: [EnvelopeEncryptionService, CsrfService, CsrfGuard],
  exports: [EnvelopeEncryptionService, CsrfService, CsrfGuard]
})
export class SecurityModule {}
