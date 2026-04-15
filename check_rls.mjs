import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function checkRLS() {
  try {
    await client.connect();
    console.log("Connected to database...");
    
    const query = `
      SELECT
        schemaname,
        tablename,
        rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;
    
    const res = await client.query(query);
    console.log("Tables missing RLS:");
    for (const row of res.rows) {
      if (!row.rowsecurity) {
        console.log(`- ${row.schemaname}.${row.tablename}`);
      }
    }
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

checkRLS();
