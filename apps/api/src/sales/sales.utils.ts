import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";

export function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

export function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatQuantity(value: number) {
  return String(Math.round(value));
}

export function productLabel(product: { name: string; size: string }) {
  return product.size ? `${product.name} - ${product.size}` : product.name;
}

export function toDayRange(dateInput?: string) {
  const base = dateInput ? new Date(`${dateInput}T00:00:00`) : new Date();

  if (Number.isNaN(base.getTime())) {
    throw new BadRequestException("Enter a valid summary date.");
  }

  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
}

export function generateDisplayToken() {
  return randomBytes(12).toString("base64url");
}
