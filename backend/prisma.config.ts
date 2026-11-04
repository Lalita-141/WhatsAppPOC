import "dotenv/config";
import { defineConfig } from "prisma/config";

// The app connects with DATABASE_* parts, so the CLI can use the same settings.
const buildDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const {
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_USER,
    DATABASE_PASSWORD,
    DATABASE_NAME,
  } = process.env;

  const credentials = DATABASE_PASSWORD
    ? `${encodeURIComponent(DATABASE_USER ?? "")}:${encodeURIComponent(DATABASE_PASSWORD)}`
    : encodeURIComponent(DATABASE_USER ?? "");

  return `mysql://${credentials}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
};

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: buildDatabaseUrl(),
  },
});