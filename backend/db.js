// db.js
import dotenv from "dotenv";
dotenv.config();
import pkg from "pg";

const { Pool, types } = pkg;
types.setTypeParser(1082, (val) => val); // OID 1082 = DAT

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});
