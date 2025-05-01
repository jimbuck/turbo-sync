import { join } from 'node:path';
import debug from 'debug';
import { hasPackageJsonChanged, readJson, writeJson } from './utils/file-utils.js';
import { PackageJson, RootPackageJson } from './types.js';
import dotnetPlugin from './plugins/dotnet.js';
import { getWorkspaceFiles } from './plugins/shared.js';

const log = debug('turbo-sync:lib');

/**
 * Synchronizes package.json files across workspaces in a monorepo using configured plugins.
 * 
 * This function reads the root package.json, identifies all workspaces based on the workspace
 * globs defined in the root package.json, and processes each workspace through the available
 * plugins. Each plugin can detect workspaces and update their package.json files based on
 * project-specific information.
 * 
 * @param {Object} options - The options for the turboSync function
 * @param {string} options.cwd - The current working directory (root of the repository)
 * @returns {Promise<void>} A promise that resolves when the synchronization is complete
 */
export async function turboSync({ cwd }: { cwd: string }) {
  log(`Processing repository at: ${cwd}`);

  const packageJsonPath = join(cwd, 'package.json');
  const packageJson = await readJson<RootPackageJson>(packageJsonPath) ?? { workspaces: [] };
  log(`Found workspaces in package.json: ${packageJson.workspaces?.join(', ') || 'none'}`);

  const turboSyncConfig = packageJson['turbo-sync'] || {};
  log('Using turbo-sync configuration:', turboSyncConfig);
  const plugins = [
    dotnetPlugin(turboSyncConfig?.dotnet ?? {}),
  ] as const;
  log(`Loaded ${plugins.length} plugins`);

  const workspaceGlobs = packageJson.workspaces || [];
  log(`Finding files in workspaces: ${workspaceGlobs.join(', ')}`);

  for (const plugin of plugins) {
    log(`Processing plugin: ${plugin.name}`);

    const files = await getWorkspaceFiles({ cwd, workspaces: workspaceGlobs, workspaceFiles: plugin.workspaceFiles });
    log(`Found ${files.length} files in workspaces`);

    let workspaces = await plugin.getWorkspaces({ cwd, files });
    log(`Plugin found ${workspaces.length} workspaces`);

    for (const workspace of workspaces) {
      log(`Processing workspace: ${workspace.workspaceName} at ${workspace.workspacePath}`);
      const workspacePackageJsonPath = join(workspace.workspacePath, 'package.json');
      const workspacePackageJson = await readJson<PackageJson>(workspacePackageJsonPath) ?? { name: workspace.workspaceName };
      log(`Found existing package.json: ${workspacePackageJson ? 'yes' : 'no'}`);

      const updatedPackageJson = await plugin.updateWorkspace({ cwd, packageJson: workspacePackageJson, ...workspace }) ?? { name: workspace.workspaceName };
      if (hasPackageJsonChanged(workspacePackageJson, updatedPackageJson)) {
        log(`Changes detected in ${workspace.workspaceName}, writing updated package.json`);
        await writeJson(workspacePackageJsonPath, updatedPackageJson);
      } else {
        log(`No changes detected for ${workspace.workspaceName}`);
      }
    }
  }

  log('Command completed');
}