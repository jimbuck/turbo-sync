import { readFile, writeFile } from 'node:fs/promises';
import debug from 'debug';
import fastGlob from 'fast-glob';
import pMap from 'p-map';

import { PackageJson, TurboSyncPlugin } from './types.js';


const log = debug('turbo-sync:file-utils');

export const IGNORE_FILES = ['**/node_modules/**'];

export async function readJson<T>(filePath: string): Promise<T | undefined> {
  log(`Reading JSON file: ${filePath}`);
  try {
    const fileContent = await readFile(filePath, 'utf-8');
    log(`Successfully read file: ${filePath}`);
    return JSON.parse(fileContent) as T;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      log(`File not found: ${filePath}`);
      return undefined;
    }
    log(`Error reading file: ${filePath}`, error);
    throw error;
  }
}

export async function writeJson<T>(filePath: string, packageJson: T) {
  log(`Writing JSON to file: ${filePath}`);
  const fileContent = JSON.stringify(packageJson, null, 2);
  await writeFile(filePath, fileContent, 'utf-8');
  log(`Successfully wrote file: ${filePath}`);
}

export function hasPackageJsonChanged(original: PackageJson, updated: PackageJson): boolean {
  log(`Comparing package.json objects for changes`);

  if (original.name !== updated.name) {
    log(`Name changed: ${original.name} -> ${updated.name}`);
    return true;
  }

  if (original.version !== updated.version) {
    log(`Version changed: ${original.version} -> ${updated.version}`);
    return true;
  }

  const originalScripts = Object.keys(original.scripts || {});
  const updatedScripts = Object.keys(updated.scripts || {});

  if (originalScripts.length !== updatedScripts.length) {
    log(`Number of scripts changed: ${originalScripts.length} -> ${updatedScripts.length}`);
    return true;
  }

  for (const script of updatedScripts) {
    if (original.scripts![script] !== updated.scripts![script]) {
      log(`Script '${script}' changed: ${original.scripts![script]} -> ${updated.scripts![script]}`);
      return true;
    }
  }

  const originalDependencies = Object.keys(original.dependencies || {});
  const updatedDependencies = Object.keys(updated.dependencies || {});

  if (originalDependencies.length !== updatedDependencies.length) {
    log(`Number of dependencies changed: ${originalDependencies.length} -> ${updatedDependencies.length}`);
    return true;
  }

  for (const dependency of updatedDependencies) {
    if (original.dependencies![dependency] !== updated.dependencies![dependency]) {
      log(`Dependency '${dependency}' changed: ${original.dependencies![dependency]} -> ${updated.dependencies![dependency]}`);
      return true;
    }
  }

  log('No changes detected');
  return false;
}

export async function getWorkspaceFiles({ cwd, workspaces, plugin }: { cwd: string; workspaces: string[], plugin: { workspaceFiles: string[], ignore: string[] } }) {
  const { workspaceFiles, ignore } = plugin;
  const ignoreFiles = [...IGNORE_FILES, ...ignore];
  log(`Getting workspace files in ${cwd} for patterns: ${workspaces.join(', ')}`);
  log(`Using ignore patterns: ${ignoreFiles.join(', ')}`);
  log(`Using workspace files: ${workspaceFiles.join(', ')}`);

  if (!workspaces) return [];

  const ignoredGlobs = workspaces
    .filter((glob) => glob.startsWith("!"))
    .map((glob) => glob.slice(1));

  const includeGlobs = workspaces.filter((glob) => !glob.startsWith("!"));

  const files = await pMap(workspaceFiles.flatMap((workspaceFile: string) => includeGlobs.map((glob: string) => `${glob}/${workspaceFile}`)), async (workspaceGlob: string) => {
    return await fastGlob.glob(workspaceGlob, {
      cwd,
      onlyFiles: true,
      absolute: true,
      ignore: [...ignoreFiles, ...ignoredGlobs],
    });
  }, { concurrency: 4 });

  return files.flat();
}