// Downloads every file in the Supabase Storage bucket (docs, chat images/
// attachments, etc. — everything lives in one bucket, see storage.ts) into a
// local directory, preserving folder structure. Used by the biweekly backup
// workflow (.github/workflows/db-backup.yml) alongside a plain pg_dump, since
// pg_dump only captures the database — not Storage files.
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const BUCKET = 'trucker-documents';

async function listAllFiles(supabase: any, bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const paths: string[] = [];
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      paths.push(fullPath);
    } else {
      const subPaths = await listAllFiles(supabase, bucket, fullPath);
      paths.push(...subPaths);
    }
  }
  return paths;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: ts-node mirrorStorage.ts <output-dir>');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set — skipping storage mirror');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Listing files in bucket "${BUCKET}"...`);
  const files = await listAllFiles(supabase, BUCKET, '');
  console.log(`Found ${files.length} file(s). Downloading to ${outDir}...`);

  let ok = 0;
  let failed = 0;
  for (const filePath of files) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
      if (error || !data) throw error || new Error('no data');
      const localPath = path.join(outDir, filePath);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
      ok++;
    } catch (err: any) {
      console.warn(`  ⚠ failed to download ${filePath}: ${err?.message || err}`);
      failed++;
    }
  }
  console.log(`Done. ${ok} downloaded, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
