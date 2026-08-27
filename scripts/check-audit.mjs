#!/usr/bin/env node
/**
 * Dependency vulnerability gate — ENGINEERING.md §6.1 ("npm audit-equivalent
 * in CI, blocking merge").
 *
 * Plain `npm audit --audit-level=high` has no per-advisory allowlist, so a
 * known, already-investigated, deliberately-accepted risk (see
 * DECISIONS_LOG.md -> "Deferred Hardening Items (Slice 7 audit)") would
 * leave this gate permanently red — training reviewers to ignore it, which
 * defeats the point of a blocking gate. This wraps `npm audit --json` and
 * fails the build only on a high/critical advisory that is NOT already on
 * the accepted-risk allowlist below, so the gate stays meaningful: green
 * for known/accepted risk, red the moment anything new shows up.
 *
 * To accept a new advisory: add its GHSA ID here with a comment explaining
 * why, and record the decision in DECISIONS_LOG.md. Do not add an entry
 * just to silence a failing build without that review.
 */

import { execSync } from 'node:child_process';

const ALLOWLISTED_GHSA_IDS = new Set([
  // deepmerge-ts <8.0.0, via @prisma/config -> prisma (devDependency, CLI
  // tooling only, not shipped in the runtime image). No fix available
  // without a breaking major-version bump to prisma. DECISIONS_LOG.md.
  'GHSA-ggr8-5vv4-36mx',
  // tar <=7.5.20, via @mapbox/node-pre-gyp -> bcrypt's native build
  // toolchain (install-time only, not shipped in the runtime image). No fix
  // available without a breaking major-version bump to bcrypt.
  // DECISIONS_LOG.md.
  'GHSA-34x7-hfp2-rc4v',
  'GHSA-8qq5-rm4j-mr97',
  'GHSA-83g3-92jg-28cx',
  'GHSA-qffp-2rhf-9h96',
  'GHSA-9ppj-qmqm-q256',
  'GHSA-r6q2-hw4h-h46w',
  'GHSA-vmf3-w455-68vh',
  'GHSA-w8wr-v893-vjvp',
  'GHSA-23hp-3jrh-7fpw',
  'GHSA-8x88-c5mf-7j5w',
  'GHSA-gvwx-54wh-qm9j',
  'GHSA-r292-9mhp-454m',
]);

const FAIL_ON_SEVERITIES = new Set(['high', 'critical']);

function ghsaIdFromUrl(url) {
  const match = /advisories\/(GHSA-[a-z0-9-]+)/i.exec(url || '');
  return match ? match[1] : url;
}

function runAudit() {
  try {
    const stdout = execSync('npm audit --json', { encoding: 'utf8' });
    return JSON.parse(stdout);
  } catch (err) {
    // npm audit exits non-zero when it finds anything; the JSON report is
    // still on stdout.
    const stdout = err.stdout ? err.stdout.toString() : '';
    if (!stdout) {
      console.error('npm audit did not produce parseable JSON output:', err.message);
      process.exit(1);
    }
    return JSON.parse(stdout);
  }
}

const report = runAudit();
const found = new Map(); // ghsaId -> { title, url, severity, package }

for (const [pkgName, vuln] of Object.entries(report.vulnerabilities || {})) {
  for (const via of vuln.via || []) {
    if (typeof via !== 'object' || !via.url) continue; // string entries are just "depends on X", not their own advisory
    if (!FAIL_ON_SEVERITIES.has(via.severity)) continue;
    const id = ghsaIdFromUrl(via.url);
    found.set(id, { title: via.title, url: via.url, severity: via.severity, package: pkgName });
  }
}

const accepted = [...found.entries()].filter(([id]) => ALLOWLISTED_GHSA_IDS.has(id));
const unaccepted = [...found.entries()].filter(([id]) => !ALLOWLISTED_GHSA_IDS.has(id));

if (accepted.length > 0) {
  console.log(
    `npm audit: ${accepted.length} known, deliberately-accepted advisor${accepted.length === 1 ? 'y' : 'ies'} present (see DECISIONS_LOG.md "Deferred Hardening Items"):`,
  );
  for (const [id, info] of accepted) {
    console.log(`  - ${id} [${info.severity}] (${info.package}): ${info.title}`);
  }
}

if (unaccepted.length > 0) {
  console.error(
    `\nnpm audit: ${unaccepted.length} high/critical advisor${unaccepted.length === 1 ? 'y' : 'ies'} NOT on the accepted-risk allowlist:`,
  );
  for (const [id, info] of unaccepted) {
    console.error(`  - ${id} [${info.severity}] (${info.package}): ${info.title} -- ${info.url}`);
  }
  console.error(
    '\nFix the dependency (npm audit fix / a version bump), or — only after review — add its GHSA ID to ALLOWLISTED_GHSA_IDS in scripts/check-audit.mjs and record the decision in DECISIONS_LOG.md.',
  );
  process.exit(1);
}

console.log('npm audit: no unaccepted high/critical vulnerabilities.');
