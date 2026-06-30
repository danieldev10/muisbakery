import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";

import { AuthService } from "./auth.service";
import type { RequestWithUser } from "./auth.types";

/**
 * Allows the request through only when the caller is signed in with the ADMIN
 * role. The authenticated user is attached to `request.user` for handlers.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    request.user = await this.auth.requireRole(request, "ADMIN");
    return true;
  }
}
