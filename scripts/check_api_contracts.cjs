#!/usr/bin/env node
/*
  Simple FE/BE contract checker for xCalificator.
  Scans FastAPI routers and frontend api.{method} calls and reports mismatches.
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTERS_DIR = path.join(ROOT, 'backend', 'app', 'routers');
const FRONTEND_DIR = path.join(ROOT, 'frontend', 'src');

function listFilesRecursively(startDir, extensions) {
  const out = [];
  const stack = [startDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (extensions.some((ext) => entry.name.endsWith(ext))) {
        out.push(fullPath);
      }
    }
  }

  return out;
}

function normalizePath(rawPath) {
  let value = String(rawPath || '').trim();
  if (!value) return '/';

  // Drop query params.
  const queryIndex = value.indexOf('?');
  if (queryIndex >= 0) {
    value = value.slice(0, queryIndex);
  }

  // Replace template expressions and path params with a generic token.
  value = value.replace(/\$\{[^}]+\}/g, '{}');
  value = value.replace(/\{[^}]+\}/g, '{}');

  // Collapse '/api' prefix because backend routers are mounted under '/api'.
  value = value.replace(/^\/api(?=\/|$)/, '');

  // Ensure a single leading slash.
  if (!value.startsWith('/')) {
    value = `/${value}`;
  }

  value = value.replace(/\/+/g, '/');
  if (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1);
  }

  return value || '/';
}

function parseBackendRoutes() {
  const files = listFilesRecursively(ROUTERS_DIR, ['.py']);
  const routes = new Set();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');

    const prefixMatch = content.match(/APIRouter\(\s*prefix\s*=\s*["']([^"']+)["']/);
    const prefix = prefixMatch ? prefixMatch[1] : '';

    const routeRegex = /@router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = normalizePath(`${prefix}${match[2]}`);
      routes.add(`${method} ${routePath}`);
    }
  }

  return routes;
}

function parseFrontendCalls() {
  const files = listFilesRecursively(FRONTEND_DIR, ['.js', '.jsx']);
  const calls = new Set();
  const callRegex = /api\.(get|post|put|patch|delete)\s*\(\s*(["'`])([\s\S]*?)\2/g;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = callRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const rawPath = (match[3] || '').trim();

      // Only compare relative API routes.
      if (!rawPath.startsWith('/')) continue;

      const normalized = normalizePath(rawPath);
      calls.add(`${method} ${normalized}`);
    }
  }

  return calls;
}

function printSet(title, values) {
  console.log(`\n${title} (${values.length}):`);
  if (!values.length) {
    console.log('  - none');
    return;
  }
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

function main() {
  if (!fs.existsSync(ROUTERS_DIR)) {
    console.error(`Routers directory not found: ${ROUTERS_DIR}`);
    process.exit(2);
  }
  if (!fs.existsSync(FRONTEND_DIR)) {
    console.error(`Frontend directory not found: ${FRONTEND_DIR}`);
    process.exit(2);
  }

  const backendRoutes = parseBackendRoutes();
  const frontendCalls = parseFrontendCalls();

  const frontendUnmatched = [...frontendCalls].filter((call) => !backendRoutes.has(call)).sort();
  const backendUnused = [...backendRoutes].filter((route) => !frontendCalls.has(route)).sort();

  console.log('xCalificator FE/BE Contract Report');
  console.log('=================================');
  console.log(`Backend routes: ${backendRoutes.size}`);
  console.log(`Frontend calls: ${frontendCalls.size}`);
  console.log(`Frontend unmatched: ${frontendUnmatched.length}`);
  console.log(`Backend not referenced by frontend: ${backendUnused.length}`);

  printSet('Frontend unmatched calls', frontendUnmatched);
  printSet('Backend routes not referenced by frontend', backendUnused);

  if (frontendUnmatched.length > 0) {
    console.error('\nContract check failed: frontend has calls that do not match backend routes.');
    process.exit(1);
  }

  console.log('\nContract check passed.');
}

main();
