import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 10,
  // MySQL 8+ needs this for caching_sha2 logins without TLS. Loopback only,
  // because over a network it would let an attacker supply the key.
  allowPublicKeyRetrieval: /^(localhost|127\.|::1$)/.test(
    process.env.DATABASE_HOST ?? "",
  ),
});

const prisma = new PrismaClient({ adapter });

export default prisma;