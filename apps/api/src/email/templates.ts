export type EmailTemplate = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function otpEmail(input: { firstName: string; code: string; purpose: "sign in" | "verify your email" | "reset your password"; expiresMinutes: number }): EmailTemplate {
  const name = escapeHtml(input.firstName || "there");
  const code = escapeHtml(input.code);
  const subject = `Your Oynk code to ${input.purpose}`;
  const text = `Hello ${input.firstName || "there"},\n\nYour Oynk verification code is ${input.code}. It expires in ${input.expiresMinutes} minutes. Do not share this code. Oynk support will never ask for it.\n\nIf you did not request this, you can ignore this message or contact support@oynk.io.`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f5f2;color:#132019;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dfe5df;border-radius:14px"><tr><td style="padding:32px"><p style="margin:0 0 28px;font-size:22px;font-weight:700">Oynk</p><h1 style="font-size:24px;margin:0 0 12px">${escapeHtml(input.purpose[0]?.toUpperCase() + input.purpose.slice(1))}</h1><p>Hello ${name},</p><p>Use this one-time code to ${escapeHtml(input.purpose)}:</p><p style="font:700 34px/1.2 monospace;letter-spacing:8px;margin:28px 0">${code}</p><p>This code expires in ${input.expiresMinutes} minutes.</p><p style="color:#5d6b62;font-size:14px">Do not share this code. Oynk support will never ask for it. If you did not request this message, contact support@oynk.io.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
