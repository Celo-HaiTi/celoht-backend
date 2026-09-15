import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const deniedDirNames = new Set(['__mocks__', 'mocks', 'mock', 'fixtures', 'fixture', 'seed', 'demo']);
const denyPatterns = [
  /from\s+["'][^"']*(?:\/mock|\/mocks|\/fixtures?|\/seed|\/demo|__mocks__)[^"']*["']/,
  /import\s+["'][^"']*(?:\/mock|\/mocks|\/fixtures?|\/seed|\/demo|__mocks__)[^"']*["']/,
  /(?:mock|fixture|seed|demo)\s*data/i,
];

const excludedDirs = new Set(['.git', '.next', 'node_modules', 'coverage', 'dist', 'build']);
const scanTargets = ['src', 'app', 'scripts'];
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      if (entry.isDirectory()) continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) continue;
      if (deniedDirNames.has(entry.name)) {
        hits.push(`${path.relative(root, fullPath)}: denied mock-data directory name`);
        continue;
      }
      walk(fullPath);
      continue;
    }

    if (!/\.(ts|tsx|js|mjs)$/i.test(entry.name)) continue;

    const rel = path.relative(root, fullPath);
    if (!scanTargets.some((target) => rel === target || rel.startsWith(`${target}/`))) {
      continue;
    }

    const text = fs.readFileSync(fullPath, 'utf8');
    if (denyPatterns.some((pattern) => pattern.test(text))) {
      hits.push(`${rel}: contains prohibited mock-data import or naming pattern`);
    }
  }
}

for (const target of scanTargets) {
  const targetPath = path.join(root, target);
  if (fs.existsSync(targetPath)) walk(targetPath);
}

if (hits.length > 0) {
  console.error('Mock-data guard failed:');
  for (const hit of hits) console.error(` - ${hit}`);
  process.exit(1);
}

console.log('Mock-data guard passed: no prohibited mock-data imports or directories detected in production code paths.');
