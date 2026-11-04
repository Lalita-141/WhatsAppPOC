// Must be the first import in every test file: it configures the environment
// before the application modules read it. It must not use top-level await:
// that would let later imports load the app, and its .env database, first.
import { tmpdir } from "node:os";
const rawUrl = process.env.TEST_DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required, e.g. mysql://root@127.0.0.1:3306/whatsapp_test",
  );
}

const url = new URL(rawUrl);
const databaseName = url.pathname.slice(1);

// The tests erase every table, so refuse anything that is not clearly disposable.
if (
  !databaseName.endsWith("_test") ||
  !["127.0.0.1", "localhost"].includes(url.hostname)
) {
  throw new Error(
    "Refusing to run: TEST_DATABASE_URL must be a local database whose name ends in _test",
  );
}

Object.assign(process.env, {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: rawUrl,
  DATABASE_HOST: url.hostname,
  DATABASE_PORT: url.port || "3306",
  DATABASE_USER: decodeURIComponent(url.username),
  DATABASE_PASSWORD: decodeURIComponent(url.password),
  DATABASE_NAME: databaseName,
  JWT_ACCESS_SECRET: "test-access-secret-test-access-secret",
  JWT_PROFILE_SETUP_SECRET: "test-setup-secret-test-setup-secret",
  OTP_HASH_SECRET: "test-otp-secret-test-otp-secret-otp",
  OTP_DEV_ECHO: "false",
  SMS_PROVIDER: "console",
  CORS_ORIGINS: "https://admin.example.com",
  RATE_LIMIT_MULTIPLIER: "1000",
  TRUST_PROXY: "0",
  // Uploaded files go to a throwaway directory, never the real storage folder.
  MEDIA_STORAGE_DIR: `${tmpdir()}/wa-test-media-${process.pid}`,
  MEDIA_URL_SECRET: "test-media-secret-test-media-secret",
});

export {};
