import { randomUUID } from "node:crypto";
import tls from "node:tls";

import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { EmailTemplate } from "./templates.js";

type SendInput = EmailTemplate & { to: string };

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function encodeBody(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
}

function waitFor(socket: tls.TLSSocket, accepted: readonly number[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => finish(new Error("SMTP response timed out")), 15_000);
    const cleanup = () => { clearTimeout(timeout); socket.off("data", onData); socket.off("error", finish); };
    const finish = (error?: Error) => { cleanup(); if (error) reject(error); };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n").filter(Boolean);
      const last = lines.at(-1);
      if (!last || !/^\d{3} /.test(last)) return;
      const code = Number(last.slice(0, 3));
      cleanup();
      if (!accepted.includes(code)) reject(new Error(`SMTP command failed with status ${code}`));
      else resolve(buffer);
    };
    socket.on("data", onData);
    socket.once("error", finish);
  });
}

async function command(socket: tls.TLSSocket, value: string, accepted: readonly number[]): Promise<string> {
  const response = waitFor(socket, accepted);
  socket.write(`${value}\r\n`);
  return response;
}

async function recordDelivery(input: SendInput, status: "DELIVERED"|"FAILED"|"PREVIEWED", attempts: number, errorCode?: string): Promise<void> {
  try {
    await pool.query(`INSERT INTO email_deliveries(id,recipient,template,provider,status,attempts,error_code,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())`, [randomUUID(), input.to, input.subject, config.EMAIL_PROVIDER, status, attempts, errorCode ?? null]);
  } catch (error) {
    console.warn("[email] unable to record delivery outcome", { status, error: error instanceof Error ? error.message : "Unknown database error" });
  }
}

async function sendZoho(input: SendInput): Promise<void> {
  if (!config.ZOHO_SMTP_SECURE) throw new Error("Zoho SMTP transport currently requires implicit TLS");
  const socket = tls.connect({ host: config.ZOHO_SMTP_HOST, port: config.ZOHO_SMTP_PORT, servername: config.ZOHO_SMTP_HOST, rejectUnauthorized: true });
  await waitFor(socket, [220]);
  await command(socket, `EHLO ${new URL(config.API_PUBLIC_URL).hostname}`, [250]);
  await command(socket, "AUTH LOGIN", [334]);
  await command(socket, Buffer.from(config.ZOHO_SMTP_USERNAME).toString("base64"), [334]);
  await command(socket, Buffer.from(config.ZOHO_SMTP_APP_PASSWORD).toString("base64"), [235]);
  await command(socket, `MAIL FROM:<${sanitizeHeader(config.EMAIL_FROM_ADDRESS)}>`, [250]);
  await command(socket, `RCPT TO:<${sanitizeHeader(input.to)}>`, [250, 251]);
  await command(socket, "DATA", [354]);
  const boundary = `oynk-${Date.now().toString(36)}`;
  const message = [
    `From: ${sanitizeHeader(config.EMAIL_FROM_NAME)} <${sanitizeHeader(config.EMAIL_FROM_ADDRESS)}>`,
    `To: ${sanitizeHeader(input.to)}`,
    `Reply-To: ${sanitizeHeader(config.EMAIL_REPLY_TO)}`,
    `Subject: ${sanitizeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", encodeBody(input.text),
    `--${boundary}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", encodeBody(input.html),
    `--${boundary}--`, ""
  ].join("\r\n").replace(/^\./gm, "..");
  socket.write(`${message}\r\n.\r\n`);
  await waitFor(socket, [250]);
  await command(socket, "QUIT", [221]);
  socket.end();
}

export async function sendEmail(input: SendInput): Promise<void> {
  if (config.EMAIL_PROVIDER === "development") {
    console.info("[email:development]", { to: input.to.replace(/^(.{2}).*(@.*)$/, "$1…$2"), subject: input.subject });
    await recordDelivery(input,"PREVIEWED",1);
    return;
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { await sendZoho(input); await recordDelivery(input,"DELIVERED",attempt); return; } catch (error) {
      lastError = error;
      console.warn("[email] delivery attempt failed", { attempt, provider: config.EMAIL_PROVIDER, error: error instanceof Error ? error.message : "Unknown delivery error" });
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  await recordDelivery(input,"FAILED",3,lastError instanceof Error?lastError.name:"UNKNOWN");
  throw lastError;
}

export async function verifyEmailConnection(): Promise<void> {
  if (config.EMAIL_PROVIDER === "development") return;
  const socket = tls.connect({ host: config.ZOHO_SMTP_HOST, port: config.ZOHO_SMTP_PORT, servername: config.ZOHO_SMTP_HOST, rejectUnauthorized: true });
  await waitFor(socket, [220]);
  await command(socket, "QUIT", [221]);
  socket.end();
}
