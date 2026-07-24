import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

import { getSmtpConfig } from "../config/env";

type PasswordResetMessage = {
  to: string;
  name: string | null;
  code: string;
  expiresInMinutes: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return replacements[character] ?? character;
  });
}

@Injectable()
export class MailService {
  async sendPasswordResetCode(message: PasswordResetMessage) {
    const config = getSmtpConfig();

    if (!config) {
      throw new Error("Password recovery email is not configured.");
    }

    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    const greeting = message.name?.trim()
      ? `Hello ${message.name.trim()},`
      : "Hello,";

    await transport.sendMail({
      from: config.from,
      to: message.to,
      subject: "Muis Bakery password recovery code",
      text: `${greeting}\n\nYour Muis Bakery password recovery code is ${message.code}. It expires in ${message.expiresInMinutes} minutes and can only be used once.\n\nIf you did not request this code, contact the system administrator.`,
      html: `<p>${escapeHtml(greeting)}</p><p>Your Muis Bakery password recovery code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${message.code}</p><p>It expires in ${message.expiresInMinutes} minutes and can only be used once.</p><p>If you did not request this code, contact the system administrator.</p>`,
    });
  }
}
