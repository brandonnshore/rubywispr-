#!/usr/bin/env node

import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".swiftpm",
  "DerivedData",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const isMarkdownFile = (filePath) => filePath.endsWith(".md");

const toPosixPath = (filePath) => filePath.split(path.sep).join("/");

const walkMarkdownFiles = async (directoryPath) => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") {
      continue;
    }

    if (ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
};

const extractMarkdownLinks = (content) => {
  const links = [];
  const inlineLinkPattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
  const referenceLinkPattern = /^\s{0,3}\[[^\]\n]+]:\s+(\S+)/gm;
  const htmlLinkPattern = /\b(?:href|src)=["']([^"']+)["']/g;

  for (const match of content.matchAll(inlineLinkPattern)) {
    links.push(match[1]);
  }

  for (const match of content.matchAll(referenceLinkPattern)) {
    links.push(match[1]);
  }

  for (const match of content.matchAll(htmlLinkPattern)) {
    links.push(match[1]);
  }

  return links;
};

const firstLinkToken = (rawLink) => {
  const trimmed = rawLink.trim();

  if (trimmed.startsWith("<")) {
    const closingIndex = trimmed.indexOf(">");
    if (closingIndex > 1) {
      return trimmed.slice(1, closingIndex);
    }
  }

  return trimmed.split(/\s+/)[0] ?? "";
};

const stripFragmentAndQuery = (linkTarget) => {
  const fragmentIndex = linkTarget.indexOf("#");
  const queryIndex = linkTarget.indexOf("?");
  const endIndexes = [fragmentIndex, queryIndex].filter((index) => index >= 0);
  const endIndex = endIndexes.length > 0 ? Math.min(...endIndexes) : linkTarget.length;

  return linkTarget.slice(0, endIndex);
};

const decodeLocalPath = (linkTarget) => {
  try {
    return decodeURIComponent(linkTarget);
  } catch {
    return linkTarget;
  }
};

const shouldSkipTarget = (target) =>
  target === "" ||
  target.startsWith("#") ||
  target.startsWith("/") ||
  target.startsWith("//") ||
  target.startsWith("~") ||
  /^[a-z][a-z0-9+.-]*:/i.test(target);

const targetExists = async (absoluteTargetPath) => {
  try {
    await lstat(absoluteTargetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }

    throw error;
  }
};

const checkMarkdownFile = async (filePath) => {
  const content = await readFile(filePath, "utf8");
  const fileDirectory = path.dirname(filePath);
  const brokenLinks = [];
  let checkedLinkCount = 0;

  for (const rawLink of extractMarkdownLinks(content)) {
    const target = firstLinkToken(rawLink);

    if (shouldSkipTarget(target)) {
      continue;
    }

    const localPath = decodeLocalPath(stripFragmentAndQuery(target));

    if (localPath === "") {
      continue;
    }

    const absoluteTargetPath = path.resolve(fileDirectory, localPath);
    const relativeTargetPath = path.relative(repoRoot, absoluteTargetPath);

    checkedLinkCount += 1;

    if (relativeTargetPath.startsWith("..") || path.isAbsolute(relativeTargetPath)) {
      brokenLinks.push(`${target} escapes the repository`);
      continue;
    }

    if (!(await targetExists(absoluteTargetPath))) {
      brokenLinks.push(`${target} -> ${toPosixPath(relativeTargetPath)}`);
    }
  }

  return {
    brokenLinks,
    checkedLinkCount,
  };
};

const main = async () => {
  const markdownFiles = (await walkMarkdownFiles(repoRoot)).sort();
  const failures = [];
  let checkedLinkCount = 0;

  for (const filePath of markdownFiles) {
    const result = await checkMarkdownFile(filePath);
    checkedLinkCount += result.checkedLinkCount;

    for (const brokenLink of result.brokenLinks) {
      failures.push(`${toPosixPath(path.relative(repoRoot, filePath))}: ${brokenLink}`);
    }
  }

  if (failures.length > 0) {
    console.error(`FAIL ${failures.length} broken local Markdown link(s):`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log(
    `OK checked ${checkedLinkCount} local Markdown link(s) across ${markdownFiles.length} file(s)`,
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
