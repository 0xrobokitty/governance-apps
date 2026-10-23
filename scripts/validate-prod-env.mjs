#!/usr/bin/env node
function normalize(value) {
  return (value || "").trim().toLowerCase();
}

function isEnabled(value) {
  return normalize(value) === "true";
}

function parseCsvList(value) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveRuntimeMode(env = process.env) {
  const explicit = normalize(env.NEXT_PUBLIC_RUNTIME_MODE);
  if (explicit === "development" || explicit === "preview" || explicit === "production") {
    return explicit;
  }

  const markers = [env.VERCEL_ENV, env.CF_PAGES_ENV, env.DEPLOYMENT_ENV]
    .map(normalize)
    .filter(Boolean);
  if (markers.includes("production")) return "production";
  if (markers.includes("preview") || markers.includes("staging")) return "preview";

  return normalize(env.NODE_ENV) === "production" ? "production" : "development";
}

const isNodeProduction = normalize(process.env.NODE_ENV) === "production";

if (!isNodeProduction) {
  console.log("Skipping production env validation because NODE_ENV is not production.");
  process.exit(0);
}

const errors = [];
const runtimeMode = resolveRuntimeMode(process.env);

if (!process.env.NEXT_PUBLIC_RUNTIME_MODE?.trim()) {
  errors.push(
    "NEXT_PUBLIC_RUNTIME_MODE is required when NODE_ENV=production (set to production for production deployments)."
  );
}

if (runtimeMode !== "production") {
  errors.push(
    `Runtime mode resolved to \"${runtimeMode}\". NEXT_PUBLIC_RUNTIME_MODE must resolve to \"production\" for production validation.`
  );
}

const forbiddenEnabledFlags = [
  "NEXT_PUBLIC_USE_MOCKS",
  "NEXT_PUBLIC_E2E",
  "NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK",
];

for (const name of forbiddenEnabledFlags) {
  if ((process.env[name] || "").toLowerCase() === "true") {
    errors.push(`${name} must be false in production.`);
  }
}

const requiredVars = [
  "NEXT_PUBLIC_RUNTIME_MODE",
  "NEXT_PUBLIC_WC_PROJECT_ID",
  "NEXT_PUBLIC_GLOBAL_DATA_URL",
  "NEXT_PUBLIC_RPC_URLS",
];

if (isEnabled(process.env.NEXT_PUBLIC_ENABLE_YETH)) {
  requiredVars.push("NEXT_PUBLIC_YETH_GLOBAL_DATA_URL");
}

if (isEnabled(process.env.NEXT_PUBLIC_ENABLE_YBC)) {
  requiredVars.push("NEXT_PUBLIC_YBC_DATA_URL");
}

if (isEnabled(process.env.NEXT_PUBLIC_ENABLE_DAO)) {
  requiredVars.push("NEXT_PUBLIC_DAO_VOTING_POWER_URL");
  const votingPowerUrl = process.env.NEXT_PUBLIC_DAO_VOTING_POWER_URL?.trim();
  if (votingPowerUrl) {
    try {
      const url = new URL(votingPowerUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("Expected a public HTTPS URL.");
      }
    } catch {
      errors.push("NEXT_PUBLIC_DAO_VOTING_POWER_URL must be an absolute HTTPS URL without credentials in production.");
    }
  }
}

if (isEnabled(process.env.NEXT_PUBLIC_ENABLE_TEAMS)) {
  requiredVars.push("NEXT_PUBLIC_TEAMS_DATA_URL");
}

for (const name of requiredVars) {
  if (!process.env[name] || !process.env[name]?.trim()) {
    errors.push(`${name} is required in production.`);
  }
}

if (parseCsvList(process.env.NEXT_PUBLIC_RPC_URLS).length === 0) {
  errors.push(
    "NEXT_PUBLIC_RPC_URLS must include at least one non-empty RPC URL in production."
  );
}

if (errors.length > 0) {
  console.error("Production environment validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production environment validation passed.");
