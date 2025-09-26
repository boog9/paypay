import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OrganizationsService } from "./organizations.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("organizations")
@ApiBearerAuth()
@Controller("organizations")
@UseGuards(AuthGuard("jwt"))
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("me")
  list(@CurrentUser("sub") userId: string) {
    return this.organizationsService.listOrganizationsForUser(userId);
  }
}
