import type { Request } from "express";
import type { Role } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
};

export type RequestWithUser = Request & { user?: AuthenticatedUser };

export function getRequestUser(request: Request): AuthenticatedUser {
  const user = (request as RequestWithUser).user;

  if (!user) {
    throw new Error("Request user is missing. Is the auth guard applied?");
  }

  return user;
}

export type AuthTokenPayload = {
  sub: string;
  role: Role;
};
