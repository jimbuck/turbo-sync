import { join } from 'node:path';
import debug from 'debug';
import { hasPackageJsonChanged, readJson, writeJson, getWorkspaceFiles } from './utils.js';
import { PackageJson, RootPackageJson, TurboSyncPlugin, TurboSyncPluginDefinition, TurboSyncWorkspaceResult } from './types.js';
import { plugins } from './plugins/index.js';

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

  const rootPackageJsonPath = join(cwd, 'package.json');
  const rootPackageJson = await readJson<RootPackageJson>(rootPackageJsonPath) ?? { workspaces: [] };
  log(`Found workspaces in package.json: ${rootPackageJson.workspaces?.join(', ') || 'none'}`);

  const isPnpm = rootPackageJson.packageManager?.startsWith('pnpm') ?? false;
  log(`Detected package manager: ${isPnpm ? 'pnpm' : 'npm/yarn'}`);

  const turboSyncConfig = rootPackageJson['turbo-sync'] || {};
  log('Using turbo-sync configuration:', turboSyncConfig);
  const registeredPlugins = plugins.map(({ build, ...plugin }) => ({ ...plugin, ...(build(turboSyncConfig ?? {})) }));
  log(`Loaded ${registeredPlugins.length} plugins`);

  const workspaceGlobs = rootPackageJson.workspaces || [];
  log(`Finding files in workspaces: ${workspaceGlobs.join(', ')}`);

  for (const plugin of registeredPlugins) {
    log(`Processing plugin: ${plugin.name}`);

    const files = await getWorkspaceFiles({ cwd, workspaces: workspaceGlobs, plugin });
    log(`Found ${files.length} files in workspaces`);

    let workspaces = await plugin.getWorkspaces({ cwd, files });
    log(`Plugin found ${workspaces.length} workspaces`);

    for (const workspace of workspaces) {
      log(`Processing workspace: ${workspace.workspaceName} at ${workspace.workspacePath}`);
      const workspacePackageJsonPath = join(workspace.workspacePath, 'package.json');
      const workspacePackageJson = await readJson<PackageJson>(workspacePackageJsonPath) ?? { name: workspace.workspaceName };
      log(`Found existing package.json: ${workspacePackageJson ? 'yes' : 'no'}`);

      const updatedPackageJson = await plugin.updateWorkspace({ cwd, isPnpm, packageJson: workspacePackageJson, ...workspace }) ?? { name: workspace.workspaceName };
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