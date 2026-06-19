import dotenv from 'dotenv';
import path from 'path';

// Prefer .env.test when present (set by jest globalSetup); fall back to .env
// for unit-test runs that don't need a DB at all.
const testEnvPath = path.resolve(__dirname, '../../.env.test');
const defaultEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: testEnvPath });
dotenv.config({ path: defaultEnvPath });
