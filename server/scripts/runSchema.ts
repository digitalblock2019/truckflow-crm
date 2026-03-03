import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pool, { query } from '../src/config/database';

dotenv.config();

/**
 * Split SQL file into individual statements, handling $$ function bodies.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip pure comment lines (but keep inline comments)
    if (trimmed.startsWith('--') && !inDollarQuote) {
      continue;
    }

    // Track $$ dollar-quoted strings (used in functions/triggers)
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      for (const _ of dollarMatches) {
        inDollarQuote = !inDollarQuote;
      }
    }

    current += line + '\n';

    // Statement ends at semicolon when not inside a dollar-quoted block
    if (trimmed.endsWith(';') && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') {
        statements.push(stmt);
      }
      current = '';
    }
  }

  // Catch any trailing statement without semicolon
  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function runSchema(): Promise<void> {
  const schemaPath = path.resolve(__dirname, '../../TruckFlow_CRM_Schema_v1.5.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');
  const statements = splitStatements(sql);

  console.log('Connecting to database...');
  console.log(`Running schema (${statements.length} statements)...`);

  // Pass 1: run all statements, collect failures
  let pass1Success = 0;
  const deferred: { idx: number; stmt: string }[] = [];

  for (let i = 0; i < statements.length; i++) {
    try {
      await query(statements[i]);
      pass1Success++;
    } catch (err) {
      deferred.push({ idx: i, stmt: statements[i] });
    }
  }

  // Pass 2: retry deferred statements (dependency ordering issues)
  let pass2Success = 0;
  const failed: { idx: number; stmt: string; error: string }[] = [];

  for (const item of deferred) {
    try {
      await query(item.stmt);
      pass2Success++;
    } catch (err) {
      failed.push({ idx: item.idx, stmt: item.stmt.slice(0, 80), error: (err as Error).message });
    }
  }

  console.log(`Pass 1: ${pass1Success} succeeded, ${deferred.length} deferred`);
  if (deferred.length > 0) {
    console.log(`Pass 2: ${pass2Success} succeeded, ${failed.length} failed`);
  }

  if (failed.length > 0) {
    console.log('\nFailed statements:');
    for (const f of failed) {
      console.log(`  #${f.idx}: ${f.stmt}...`);
      console.log(`    Error: ${f.error}\n`);
    }
  }

  // Report table count
  const result = await query(
    `SELECT count(*) AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'`
  );

  console.log(`\nTables in database: ${result.rows[0].count}`);
  console.log('Schema execution complete.');

  await pool.end();
}

runSchema();
