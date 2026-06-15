import { Resend } from "resend";
import { getEnv, isLive } from "./env.ts";

// Email sender behind an interface (spec §3.9). Mock logs and no-ops so dry runs
// never send; Live uses Resend. Factory picks live only when RESEND_API_KEY is set.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

export class MockEmail implements EmailSender {
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[mock email] → ${msg.to} · ${msg.subject} (${msg.html.length} chars, not sent)`);
  }
}

export class LiveResend implements EmailSender {
  private client: Resend;
  // Resend requires a verified sender; default to onboarding domain until set up.
  constructor(apiKey: string, private from = "Trading System <digest@resend.dev>") {
    this.client = new Resend(apiKey);
  }
  async send(msg: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });
    if (error) throw new Error(`resend: ${error.message}`);
  }
}

let instance: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (instance) return instance;
  instance = isLive("RESEND_API_KEY")
    ? new LiveResend(getEnv().RESEND_API_KEY!)
    : new MockEmail();
  return instance;
}
