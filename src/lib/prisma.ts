import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaLibSql({
    url: "file:./dev.db",
  });
  const client = new PrismaClient({ adapter });
  // Default SQLite: fsync tiap commit → saat impor (1 baris = 1 transaksi)
  // ribuan fsync membuat SSD sibuk 100% padahal throughput kecil. WAL menulis
  // append sekuensial dan synchronous=NORMAL hanya fsync saat checkpoint —
  // tetap aman dari korupsi; risiko mati listrik cuma kehilangan transaksi
  // terakhir (dapat diimpor ulang, impor idempoten).
  void client.$queryRawUnsafe("PRAGMA journal_mode = WAL").catch(() => {});
  void client.$executeRawUnsafe("PRAGMA synchronous = NORMAL").catch(() => {});
  void client.$executeRawUnsafe("PRAGMA busy_timeout = 5000").catch(() => {});
  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
