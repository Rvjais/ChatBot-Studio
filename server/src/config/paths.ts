import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The server package root, independent of the current working directory.
 * This file lives in src/config (tsx) or dist/config (compiled) — both two levels below it.
 */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
