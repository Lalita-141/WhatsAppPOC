import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export interface SmsProvider {
  name: string;
  send: (toE164: string, body: string) => Promise<void>;
}

// Development only. loadEnv refuses this provider when NODE_ENV=production.
const consoleProvider: SmsProvider = {
  name: "console",
  send: async (toE164, body) => {
    logger.info({ to: toE164, body }, "[dev SMS] message not sent to a carrier");
  },
};

const twilioProvider: SmsProvider = {
  name: "twilio",
  send: async (toE164, body) => {
    const { accountSid, authToken, from, messagingServiceSid } = env.twilio;

    const form = new URLSearchParams({ To: toE164, Body: body });

    if (messagingServiceSid) {
      form.set("MessagingServiceSid", messagingServiceSid);
    } else {
      form.set("From", from as string);
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Twilio responded with HTTP ${response.status}`);
    }
  },
};

const providers: Record<string, SmsProvider> = {
  console: consoleProvider,
  twilio: twilioProvider,
};

let activeProvider: SmsProvider = providers[env.smsProvider];

export const setSmsProvider = (provider: SmsProvider) => {
  activeProvider = provider;
};

export const getSmsProvider = (name: string = env.smsProvider) => providers[name];

export const sendOtpSms = async (
  toE164: string,
  otp: string,
  expiresInMinutes: number,
) => {
  await activeProvider.send(
    toE164,
    `${otp} is your verification code. It expires in ${expiresInMinutes} minutes. Do not share it with anyone.`,
  );
};
