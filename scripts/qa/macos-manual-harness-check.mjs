#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const harnessPath = "docs/qa/macos-manual-qa-harness.md";
const allowedStatuses = new Set(["Not Run", "Blocked", "Pass", "Fail", "N/A"]);

const splitTableRow = (line) =>
  line
    .trim()
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());

const stripCodeTicks = (value) => value.replace(/^`|`$/g, "").trim();

const isSeparatorRow = (cells) =>
  cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));

const rowId = (cells) => stripCodeTicks(cells[0] ?? "");

const rowStatus = (cells) => stripCodeTicks(cells[cells.length - 1] ?? "");

const lineFailure = ({ lineNumber, message }) => `${harnessPath}:${lineNumber} ${message}`;

const isRecentWisprRowId = (id) => {
  const match = /^MAC-(\d{3})$/.exec(id);
  if (!match) {
    return false;
  }

  const numericId = Number.parseInt(match[1], 10);
  return numericId >= 100 && numericId <= 108;
};

const checkStatus = ({ failures, id, lineNumber, status }) => {
  if (!allowedStatuses.has(status)) {
    failures.push(
      lineFailure({
        lineNumber,
        message: `${id} uses unsupported status '${status || "<empty>"}'`,
      }),
    );
  }
};

const main = async () => {
  const content = await readFile(harnessPath, "utf8");
  const failures = [];
  let prerequisiteRows = 0;
  let manualRows = 0;
  let runnableDocRows = 0;
  let recentWisprRows = 0;

  if (!content.includes("Status: manual QA harness only.")) {
    failures.push(`${harnessPath}: missing manual-harness-only status banner`);
  }

  if (!content.includes("Do not mark any row `Pass` based on this document")) {
    failures.push(`${harnessPath}: missing false-pass warning`);
  }

  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed.startsWith("|")) {
      return;
    }

    const cells = splitTableRow(trimmed);
    if (isSeparatorRow(cells)) {
      return;
    }

    const id = rowId(cells);

    if (/^PRE-\d{2}$/.test(id)) {
      prerequisiteRows += 1;
      const status = rowStatus(cells);
      checkStatus({ failures, id, lineNumber, status });

      if (status !== "Blocked") {
        failures.push(
          lineFailure({
            lineNumber,
            message: `${id} must remain 'Blocked' until a human-run QA pass records sanitized prerequisites`,
          }),
        );
      }
      return;
    }

    if (/^MAC-\d{3}$/.test(id)) {
      manualRows += 1;
      const status = rowStatus(cells);
      checkStatus({ failures, id, lineNumber, status });

      if (status !== "Not Run") {
        failures.push(
          lineFailure({
            lineNumber,
            message: `${id} must remain 'Not Run' in the source harness; record human evidence outside this template`,
          }),
        );
      }

      if (isRecentWisprRowId(id)) {
        recentWisprRows += 1;
        const evidenceCell = cells[4] ?? "";
        if (!/\b(real_mac|test_seam)\b/.test(evidenceCell)) {
          failures.push(
            lineFailure({
              lineNumber,
              message: `${id} evidence must name real_mac, test_seam, or both`,
            }),
          );
        }
      }
      return;
    }

    if (/^DOC-\d{3}$/.test(id)) {
      runnableDocRows += 1;
      const status = rowStatus(cells);
      checkStatus({ failures, id, lineNumber, status });

      if (status !== "Not Run") {
        failures.push(
          lineFailure({
            lineNumber,
            message: `${id} must stay 'Not Run' in the template; command output is the source-safe evidence`,
          }),
        );
      }
    }
  });

  if (prerequisiteRows < 6) {
    failures.push(`${harnessPath}: expected at least 6 PRE prerequisite rows, found ${prerequisiteRows}`);
  }

  if (manualRows < 65) {
    failures.push(`${harnessPath}: expected at least 65 MAC manual rows, found ${manualRows}`);
  }

  if (runnableDocRows < 5) {
    failures.push(`${harnessPath}: expected at least 5 DOC runnable-check rows, found ${runnableDocRows}`);
  }

  if (recentWisprRows !== 9) {
    failures.push(`${harnessPath}: expected MAC-100 through MAC-108 coverage, found ${recentWisprRows} rows`);
  }

  if (failures.length > 0) {
    console.error(`FAIL ${failures.length} macOS manual QA harness issue(s):`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log(
    `OK macOS manual QA harness guard checked ${manualRows} manual row(s), ${prerequisiteRows} prerequisite row(s), and ${recentWisprRows} Recent Wisprs evidence row(s)`,
  );
  return 0;
};

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
