#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeHtaccess } from './htaccess.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { dest, redirects } = await writeHtaccess(root);
console.log(`wrote ${path.relative(root, dest)} (${redirects} redirects from vercel.json)`);
