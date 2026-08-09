import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to bootstrap PostgreSQL.");
}

const schema = await readFile(new URL("../infra/postgres/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter((statement) => statement.replace(/--[^\n]*\n?/g, "").trim())
  .filter(Boolean);
const sql = neon(connectionString, { fullResults: true });

await sql.transaction((transaction) => statements.map((statement) => transaction.query(statement)));

console.log(`Applied ${statements.length} PostgreSQL schema statements.`);
