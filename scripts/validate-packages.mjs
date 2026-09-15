import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packagesRoot = path.join(root, 'packages');
const policy = JSON.parse(await readFile(path.join(root, 'quality/dependency-policy.json'), 'utf8'));
const packageDirs = (await readdir(packagesRoot)).sort();
const manifests = new Map();
const errors = [];
const NETWORK_PATTERNS = [
  { label: 'fetch()', regex: /\bfetch\s*\(/ },
  { label: 'WebSocket', regex: /\bnew\s+WebSocket\s*\(/ },
  { label: 'EventSource', regex: /\bnew\s+EventSource\s*\(/ },
  { label: 'XMLHttpRequest', regex: /\bnew\s+XMLHttpRequest\s*\(/ },
];

for (const directory of packageDirs) {
  const manifestPath = path.join(packagesRoot, directory, 'package.json');
  if (!(await exists(manifestPath))) continue;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifests.set(manifest.name, { directory, manifest });

  check(manifest.name === `@arichtext/${directory}`, `${directory}: package name must be @arichtext/${directory}`);
  check(manifest.license === 'MIT', `${manifest.name}: license must be MIT`);
  check(manifest.type === 'module', `${manifest.name}: type must be module`);
  check(manifest.publishConfig?.access === 'public', `${manifest.name}: publishConfig.access must be public`);
  check(manifest.publishConfig?.provenance === true, `${manifest.name}: npm provenance must be enabled`);
  check(Boolean(manifest.exports?.['.']?.types), `${manifest.name}: root export must expose types`);
  check(Boolean(manifest.exports?.['.']?.import), `${manifest.name}: root export must expose ESM import`);
  check(manifest.repository?.directory === `packages/${directory}`, `${manifest.name}: repository.directory is incorrect`);
}

for (const [packageName, { directory, manifest }] of manifests) {
  const runtimeDeps = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };

  for (const framework of policy.frameworkRuntimePackages) {
    if (runtimeDeps[framework]) {
      errors.push(`${packageName}: framework runtime dependency is forbidden in the framework-neutral workspace: ${framework}`);
    }
  }

  if (packageName === '@arichtext/web-component') {
    for (const forbidden of policy.baseEditorForbiddenDependencies) {
      if (runtimeDeps[forbidden]) {
        errors.push(`${packageName}: optional capability must not enter the base bundle: ${forbidden}`);
      }
    }
  }

  const sourceRoot = path.join(packagesRoot, directory, 'src');
  if (!(await exists(sourceRoot))) continue;
  const sourceFiles = await walk(sourceRoot, (file) => file.endsWith('.ts'));
  const imports = new Set();

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    for (const specifier of findImports(source)) {
      const internal = internalPackageName(specifier);
      if (internal && internal !== packageName) imports.add(internal);
    }

    if (policy.networkFreePackages.includes(packageName)) {
      for (const pattern of NETWORK_PATTERNS) {
        if (pattern.regex.test(source)) {
          errors.push(`${packageName}: mandatory-network primitive ${pattern.label} found in ${path.relative(root, file)}`);
        }
      }
    }
  }

  for (const internal of imports) {
    if (!manifests.has(internal)) {
      errors.push(`${packageName}: imports unknown workspace package ${internal}`);
      continue;
    }
    if (!runtimeDeps[internal]) {
      errors.push(`${packageName}: source imports ${internal} but it is not declared in dependencies/peerDependencies`);
    }
  }
}

if (errors.length > 0) {
  console.error(`\nA Rich Text package policy failed with ${errors.length} error(s):\n`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Package policy OK: ${manifests.size} public workspace packages validated.`);
  console.log('Base editor remains framework-neutral, optional-service-free and mandatory-network-free.');
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function internalPackageName(specifier) {
  if (!specifier.startsWith('@arichtext/')) return null;
  const parts = specifier.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
}

function findImports(source) {
  const values = [];
  const regex = /(?:from\s*|import\s*\(|import\s+|export\s+[^;]*?from\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(source)) !== null) values.push(match[1]);
  return values;
}

async function walk(directory, include) {
  const result = [];
  for (const entry of await readdir(directory)) {
    const full = path.join(directory, entry);
    const info = await stat(full);
    if (info.isDirectory()) result.push(...await walk(full, include));
    else if (include(full)) result.push(full);
  }
  return result;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
