import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

async function findFiles(dir, filter) {
  let results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.next') {
          results = results.concat(await findFiles(fullPath, filter));
        }
      } else if (filter(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return results;
}

async function checkBoundaries() {
  const root = process.cwd();
  let violations = [];

  // 1. Domain rules: modules/**/domain/**/*.ts cannot import infrastructure, adapters, or external libraries
  const domainFiles = (await findFiles(resolve(root, 'modules'), name => name.endsWith('.ts')))
    .filter(f => f.includes('/domain/') || f.includes('\\domain\\'))
    .filter(f => !f.endsWith('.test.ts'));

  const forbiddenInDomain = ['pg', 'pg-boss', 'next', 'drizzle-orm', 'dexie', '@monaco-editor', 'adapters'];

  for (const file of domainFiles) {
    const content = await readFile(file, 'utf8');
    for (const line of content.split('\n')) {
      if (/^\s*import\b/.test(line)) {
        for (const forbidden of forbiddenInDomain) {
          if (line.includes(`'${forbidden}`) || line.includes(`"${forbidden}`) || line.includes(`/${forbidden}/`)) {
            violations.push(`[Domain Violation] ${file}: imports forbidden '${forbidden}' -> ${line.trim()}`);
          }
        }
      }
    }
  }

  // 2. Evaluation worker rules: apps/evaluation-worker/**/*.ts cannot import scoring, progress, or topic-submission
  const workerFiles = await findFiles(resolve(root, 'apps/evaluation-worker'), name => name.endsWith('.ts'));
  const forbiddenInWorker = ['modules/topic-submission', 'domain/progress', 'domain/evaluation'];

  for (const file of workerFiles) {
    const content = await readFile(file, 'utf8');
    for (const line of content.split('\n')) {
      if (/^\s*import\b/.test(line)) {
        for (const forbidden of forbiddenInWorker) {
          if (line.includes(forbidden)) {
            violations.push(`[Worker Violation] ${file}: imports forbidden '${forbidden}' -> ${line.trim()}`);
          }
        }
      }
    }
  }

  // 3. Web UI components rules: apps/web/src/components/**/*.tsx cannot import pg or database persistence
  const componentFiles = await findFiles(resolve(root, 'apps/web/src/components'), name => name.endsWith('.tsx'));
  const forbiddenInComponents = ['pg', 'infrastructure/persistence', 'adapters/postgres'];

  for (const file of componentFiles) {
    const content = await readFile(file, 'utf8');
    for (const line of content.split('\n')) {
      if (/^\s*import\b/.test(line)) {
        for (const forbidden of forbiddenInComponents) {
          if (line.includes(forbidden)) {
            violations.push(`[Component Violation] ${file}: imports forbidden '${forbidden}' -> ${line.trim()}`);
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('Boundary check failed:');
    for (const v of violations) {
      console.error('  ' + v);
    }
    process.exit(1);
  } else {
    console.log('✓ Architecture boundaries check passed.');
  }
}

await checkBoundaries();
