import { User } from "../modules/auth/entities/user.entity";
import { Organization } from "../modules/organizations/entities/organization.entity";
import { Membership } from "../modules/organizations/entities/membership.entity";
import { StoreBinding } from "../modules/stores/entities/store-binding.entity";
import { EmailRecipient } from "../modules/notifications/entities/email-recipient.entity";
import { WebhookEventLog } from "../modules/webhooks/entities/webhook-event-log.entity";
import { ArchiveFlag } from "../modules/stores/entities/archive-flag.entity";

export const entities = [
  User,
  Organization,
  Membership,
  StoreBinding,
  EmailRecipient,
  WebhookEventLog,
  ArchiveFlag
];
