import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";

import { AuthService } from "./auth.service";
import type { RequestWithUser } from "./auth.types";

@Injectable()
export class SalesGuard implements CanActivate {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    request.user = await this.auth.requireRole(request, "ADMIN", "SALES");
    return true;
  }
}
