import "dotenv/config";

const MIN_PRODUCTION_SECRET_LENGTH = 32;

export type SmsProviderName = "console" | "twilio";

export interface AppEnv {
  nodeEnv: string;
  isProduction: boolean;
  jwtAccessSecret: string;
  jwtProfileSetupSecret: string;
  otpHashSecret: string;
  otpDevEcho: boolean;
  corsOrigins: string[];
  trustProxy: number;
  refreshTokenTtlDays: number;
  rateLimitMultiplier: number;
  smsProvider: SmsProviderName;
  calls: {
    stunUrls: string[];
    turnUrls: string[];
    turnSecret?: string;
  };
  media: {
    provider: "local";
    localDir: string;
    urlSecret: string;
  };
  twilio: {
    accountSid?: string;
    authToken?: string;
    from?: string;
    messagingServiceSid?: string;
  };
}

type RawEnv = Record<string, string | undefined>;

const parsePositiveInteger = (
  name: string,
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
};

/**
 * Builds the application config and refuses to start on an unsafe production
 * configuration, so a missing setting cannot silently weaken authentication.
 */
export const loadEnv = (raw: RawEnv): AppEnv => {
  const nodeEnv = raw.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";

  const jwtAccessSecret = raw.JWT_ACCESS_SECRET;
  const jwtProfileSetupSecret = raw.JWT_PROFILE_SETUP_SECRET;

  if (!jwtAccessSecret) {
    throw new Error("JWT_ACCESS_SECRET is not configured");
  }

  if (!jwtProfileSetupSecret) {
    throw new Error("JWT_PROFILE_SETUP_SECRET is not configured");
  }

  const smsProvider = (raw.SMS_PROVIDER ?? "console") as SmsProviderName;

  if (smsProvider !== "console" && smsProvider !== "twilio") {
    throw new Error("SMS_PROVIDER must be one of: console, twilio");
  }

  const corsOrigins = (raw.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const twilio = {
    accountSid: raw.TWILIO_ACCOUNT_SID,
    authToken: raw.TWILIO_AUTH_TOKEN,
    from: raw.TWILIO_FROM,
    messagingServiceSid: raw.TWILIO_MESSAGING_SERVICE_SID,
  };

  if (
    smsProvider === "twilio" &&
    (!twilio.accountSid ||
      !twilio.authToken ||
      (!twilio.from && !twilio.messagingServiceSid))
  ) {
    throw new Error(
      "SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID",
    );
  }

  const otpDevEcho = raw.OTP_DEV_ECHO === "true";
  const rateLimitMultiplier = parsePositiveInteger(
    "RATE_LIMIT_MULTIPLIER",
    raw.RATE_LIMIT_MULTIPLIER,
    1,
  );

  const mediaProvider = raw.MEDIA_STORAGE_PROVIDER ?? "local";

  if ((raw.TURN_URLS ?? "").trim() && !raw.TURN_SECRET) {
    throw new Error("TURN_URLS requires TURN_SECRET (the coturn static-auth-secret)");
  }

  if (mediaProvider !== "local") {
    throw new Error("MEDIA_STORAGE_PROVIDER must be local (cloud storage is not implemented yet)");
  }

  if (isProduction) {
    const secrets = {
      JWT_ACCESS_SECRET: jwtAccessSecret,
      JWT_PROFILE_SETUP_SECRET: jwtProfileSetupSecret,
      OTP_HASH_SECRET: raw.OTP_HASH_SECRET,
      MEDIA_URL_SECRET: raw.MEDIA_URL_SECRET,
    };

    for (const [name, value] of Object.entries(secrets)) {
      if (!value || value.length < MIN_PRODUCTION_SECRET_LENGTH) {
        throw new Error(
          `${name} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
        );
      }
    }

    if (jwtAccessSecret === jwtProfileSetupSecret) {
      throw new Error(
        "JWT_ACCESS_SECRET and JWT_PROFILE_SETUP_SECRET must be different in production",
      );
    }

    if (otpDevEcho) {
      throw new Error("OTP_DEV_ECHO cannot be enabled in production");
    }

    if (smsProvider === "console") {
      throw new Error("SMS_PROVIDER=console cannot be used in production");
    }

    if (corsOrigins.includes("*")) {
      throw new Error("CORS_ORIGINS cannot contain * in production");
    }

    if (rateLimitMultiplier !== 1) {
      throw new Error("RATE_LIMIT_MULTIPLIER cannot be changed in production");
    }
  }

  return {
    nodeEnv,
    isProduction,
    jwtAccessSecret,
    jwtProfileSetupSecret,
    otpHashSecret: raw.OTP_HASH_SECRET ?? jwtAccessSecret,
    calls: {
      stunUrls: (raw.STUN_URLS ?? "stun:stun.l.google.com:19302").split(",").map((u) => u.trim()).filter(Boolean),
      turnUrls: (raw.TURN_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean),
      turnSecret: raw.TURN_SECRET || undefined,
    },
    media: {
      provider: mediaProvider,
      localDir: raw.MEDIA_STORAGE_DIR ?? "storage/media",
      urlSecret: raw.MEDIA_URL_SECRET ?? `${jwtAccessSecret}:media`,
    },
    otpDevEcho,
    corsOrigins,
    trustProxy: parsePositiveInteger("TRUST_PROXY", raw.TRUST_PROXY, 0),
    refreshTokenTtlDays:
      parsePositiveInteger(
        "REFRESH_TOKEN_TTL_DAYS",
        raw.REFRESH_TOKEN_TTL_DAYS,
        30,
      ) || 30,
    rateLimitMultiplier: rateLimitMultiplier || 1,
    smsProvider,
    twilio,
  };
};

export const env = loadEnv(process.env);
