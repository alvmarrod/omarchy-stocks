#!/usr/bin/env node
// Semantic release checks: manifest shape, entry points, plugin id, version
// bump, changelog section and user-agent version consistency.
// Whether a bump is major, minor or patch, and the changelog wording, stay
// human decisions.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const REQUIRED_MANIFEST_KEYS = [
  "schemaVersion",
  "id",
  "name",
  "version",
  "author",
  "license",
  "description",
  "kinds",
  "entryPoints"
]
const SEMVER = /^\d+\.\d+\.\d+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function compareVersions(left, right) {
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

const args = process.argv.slice(2)
const baseIndex = args.indexOf("--base")
const baseRef = baseIndex === -1 ? "" : String(args[baseIndex + 1] || "")
const noRelease = args.includes("--no-release")
if (!baseRef) {
  console.error("usage: node scripts/check-release.mjs --base <git-ref> [--no-release]")
  process.exit(2)
}

let failed = false

function pass(message) {
  console.log(`ok   ${message}`)
}

function fail(message) {
  failed = true
  console.error(`FAIL ${message}`)
}

function read(path) {
  return readFileSync(path, "utf8")
}

function fromBase(path) {
  try {
    return execFileSync("git", ["show", `${baseRef}:${path}`], { encoding: "utf8" })
  } catch {
    return ""
  }
}

let manifest
try {
  manifest = JSON.parse(read("manifest.json"))
} catch (error) {
  fail(`manifest.json is not valid JSON: ${error.message}`)
  process.exit(1)
}

const missing = REQUIRED_MANIFEST_KEYS.filter(key => manifest[key] === undefined || manifest[key] === null)
if (missing.length) fail(`manifest.json is missing: ${missing.join(", ")}`)
else pass("manifest.json has the required fields")

const version = String(manifest.version || "")
if (!SEMVER.test(version)) fail(`manifest version "${version}" is not X.Y.Z`)
else pass(`manifest version is ${version}`)

if (manifest.schemaVersion !== 1) fail(`manifest schemaVersion is ${manifest.schemaVersion}; expected 1`)
if (!Array.isArray(manifest.kinds) || !manifest.kinds.length) fail("manifest kinds must be a non-empty array")

const entryPoints = manifest.entryPoints || {}
const entryKeys = Object.keys(entryPoints)
if (!entryKeys.length) fail("manifest entryPoints is empty")
for (const kind of entryKeys) {
  const path = entryPoints[kind]
  if (typeof path !== "string" || !existsSync(path)) fail(`entry point ${kind} does not exist: ${path}`)
}
if (
  entryKeys.length &&
  entryKeys.every(kind => typeof entryPoints[kind] === "string" && existsSync(entryPoints[kind]))
) {
  pass("manifest entry points exist")
}

const barWidget = existsSync("BarWidget.qml") ? read("BarWidget.qml") : ""
const moduleName = (barWidget.match(/moduleName:\s*"([^"]+)"/) || [])[1]
const ipcTarget = (barWidget.match(/target:\s*"([^"]+)"/) || [])[1]
if (moduleName !== manifest.id) fail(`BarWidget moduleName "${moduleName}" does not match manifest id "${manifest.id}"`)
if (ipcTarget !== manifest.id) fail(`IpcHandler target "${ipcTarget}" does not match manifest id "${manifest.id}"`)
if (moduleName === manifest.id && ipcTarget === manifest.id) pass("plugin id matches moduleName and IPC target")

for (const file of ["Panel.qml", "Screen.js"]) {
  if (!existsSync(file)) continue
  const versions = [...read(file).matchAll(/omarchy-stocks\/(\d+\.\d+\.\d+)/g)].map(match => match[1])
  if (!versions.length) fail(`${file} has no omarchy-stocks/<version> user agent`)
  else if (versions.some(value => value !== version))
    fail(`${file} user agent does not match manifest version ${version}`)
  else pass(`${file} user agent matches ${version}`)
}

if (noRelease) {
  console.log("skip version/changelog checks (--no-release)")
} else {
  const changelog = read("CHANGELOG.md")
  const escaped = version.replace(/\./g, "\\.")
  const matches = [...changelog.matchAll(new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})$`, "gm"))]
  if (!matches.length) fail(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`)
  else if (matches.length > 1) fail(`CHANGELOG.md has ${matches.length} sections for ${version}`)
  else {
    pass(`CHANGELOG.md has a section for ${version}`)
    const date = matches[0][1]
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!DATE.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      fail(`CHANGELOG.md date "${date}" is not a real YYYY-MM-DD date`)
    } else {
      pass(`CHANGELOG.md date is ${date}`)
    }
    const rest = changelog.slice(matches[0].index + matches[0][0].length)
    const next = rest.search(/^## \[/m)
    const section = next === -1 ? rest : rest.slice(0, next)
    if (!/^\s*-\s+\S/m.test(section)) fail(`CHANGELOG.md section ${version} has no bullet`)
    else pass(`CHANGELOG.md section ${version} has content`)
  }

  const baseManifest = fromBase("manifest.json")
  if (!baseManifest) {
    fail(`cannot read manifest.json at ${baseRef}`)
  } else {
    let baseVersion = ""
    try {
      baseVersion = String(JSON.parse(baseManifest).version || "")
    } catch {
      fail(`manifest.json at ${baseRef} is not valid JSON`)
    }
    if (baseVersion) {
      if (!SEMVER.test(baseVersion)) fail(`base manifest version "${baseVersion}" is not X.Y.Z`)
      else if (compareVersions(version, baseVersion) <= 0)
        fail(`version ${version} is not greater than base ${baseVersion}`)
      else pass(`version ${version} is greater than base ${baseVersion}`)
    }
  }

  const baseChangelog = fromBase("CHANGELOG.md")
  if (!baseChangelog) {
    fail(`cannot read CHANGELOG.md at ${baseRef}`)
  } else if (new RegExp(`^## \\[${escaped}\\]`, "m").test(baseChangelog)) {
    fail(`CHANGELOG.md already has a section for ${version} on ${baseRef}; this is not a new version`)
  } else {
    pass(`CHANGELOG.md section for ${version} is new`)
  }
}

if (failed) process.exit(1)
console.log("release checks passed")
