import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export interface PlayLensProjectConfig {
  schemaVersion: 1;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  scope: {
    include: string[];
    exclude: string[];
  };
  tasks: {
    autoCreate: boolean;
    recordOnlyWhenPlaywrightDetected: boolean;
    naming: "entry-file" | "command" | "folder";
  };
  capture: {
    preset: "light" | "balanced" | "deep-debug" | "privacy-safe";
    terminal: boolean;
    runtimeHook: boolean;
    reporter: boolean;
    network: boolean;
    console: boolean;
    system: boolean;
  };
  storage: {
    mode: "app-data" | "project-local";
    sessionsPath: string;
  };
}

export interface ProjectDetection {
  packageJson: boolean;
  playwrightConfig: boolean;
  testFiles: number;
  npmScripts: string[];
}

export interface ProjectScopeInitResult {
  rootPath: string;
  configPath: string;
  config: PlayLensProjectConfig;
  created: boolean;
  detected: ProjectDetection;
}

const CONFIG_DIR = ".playlens";
const CONFIG_FILE = "project.json";

export function initProjectScope(folder = process.cwd()): ProjectScopeInitResult {
  const rootPath = resolve(folder);
  const playlensDir = join(rootPath, CONFIG_DIR);
  const configPath = join(playlensDir, CONFIG_FILE);
  const detected = detectProject(rootPath);

  mkdirSync(playlensDir, { recursive: true });
  if (existsSync(configPath)) {
    return {
      rootPath,
      configPath,
      config: readProjectConfig(rootPath),
      created: false,
      detected
    };
  }

  const now = new Date().toISOString();
  const config: PlayLensProjectConfig = {
    schemaVersion: 1,
    name: basename(rootPath) || "PlayLens Project",
    rootPath,
    createdAt: now,
    updatedAt: now,
    scope: {
      include: ["**/*"],
      exclude: ["node_modules/**", "dist/**", "build/**", ".git/**", ".playlens/sessions/**"]
    },
    tasks: {
      autoCreate: true,
      recordOnlyWhenPlaywrightDetected: true,
      naming: "entry-file"
    },
    capture: {
      preset: "balanced",
      terminal: true,
      runtimeHook: true,
      reporter: true,
      network: true,
      console: true,
      system: true
    },
    storage: {
      mode: "project-local",
      sessionsPath: ".playlens/sessions"
    }
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { rootPath, configPath, config, created: true, detected };
}

export function findProjectRoot(start = process.cwd()): string | undefined {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, CONFIG_DIR, CONFIG_FILE))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function readProjectConfig(projectRoot = findProjectRoot() ?? process.cwd()): PlayLensProjectConfig {
  const configPath = join(resolve(projectRoot), CONFIG_DIR, CONFIG_FILE);
  if (!existsSync(configPath)) {
    throw new Error(`No PlayLens project config found at ${configPath}. Run "playlens init" first.`);
  }
  return JSON.parse(readFileSync(configPath, "utf8")) as PlayLensProjectConfig;
}

export function detectProject(rootPath = process.cwd()): ProjectDetection {
  const packageJsonPath = join(rootPath, "package.json");
  let npmScripts: string[] = [];
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
      npmScripts = Object.entries(pkg.scripts ?? {})
        .filter(([, command]) => /playwright|e2e|test/i.test(command))
        .map(([name]) => name);
    } catch {
      npmScripts = [];
    }
  }

  return {
    packageJson: existsSync(packageJsonPath),
    playwrightConfig: ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs"].some((file) =>
      existsSync(join(rootPath, file))
    ),
    testFiles: countLikelyPlaywrightFiles(rootPath),
    npmScripts
  };
}

export function resolveProjectStorageRoot(projectRoot = findProjectRoot() ?? process.cwd()): string {
  const config = existsSync(join(projectRoot, CONFIG_DIR, CONFIG_FILE)) ? readProjectConfig(projectRoot) : undefined;
  if (process.env.PLAYLENS_STORAGE_DIR) return resolve(process.env.PLAYLENS_STORAGE_DIR);
  if (!config || config.storage.mode === "project-local") return resolve(projectRoot, config?.storage.sessionsPath ?? ".playlens/sessions");
  return resolve(projectRoot, ".playlens", "sessions");
}

function countLikelyPlaywrightFiles(rootPath: string): number {
  const skip = new Set(["node_modules", "dist", "build", ".git", ".playlens"]);
  let count = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 5 || count > 500) return;
    for (const entry of safeReaddir(dir)) {
      const path = join(dir, entry);
      const stats = safeStat(path);
      if (!stats) continue;
      if (stats.isDirectory()) {
        if (!skip.has(entry)) walk(path, depth + 1);
        continue;
      }
      if (/\.(spec|test|e2e)\.[cm]?[jt]sx?$/.test(entry) || /playwright/i.test(entry)) count += 1;
    }
  };
  walk(rootPath, 0);
  return count;
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function safeStat(path: string) {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}
