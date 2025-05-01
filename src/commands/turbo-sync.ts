import { join } from 'node:path';

import { Command } from 'commander';
import debug from 'debug';

import dotnetPlugin, { DotnetWorkspacesResult, DotnetPluginConfig } from '../plugins/dotnet';
import { hasPackageJsonChanged, readJson, writeJson } from '../utils/file-utils';
import { PackageJson, RootPackageJson, TurboSyncPlugin } from '../types';
import { getWorkspaceFiles } from '../plugins/shared';

const log = debug('turbo-sync:command');
const program = new Command();

program
  .name('turbo-sync')
  .description('CLI tool to update package.json files for non-JS projects in a turborepo repository')
  .option('--debug', 'Enable debug logging')
  .action(async (options: { debug?: boolean }) => {
    if (options.debug) {
      debug.enable('turbo-sync:*');
      log('Debug logging enabled');
    }

    const cwd = process.cwd();
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

    const workspaces = packageJson.workspaces || [];
    log(`Finding files in workspaces: ${workspaces.join(', ')}`);
    const files = await getWorkspaceFiles({ cwd: cwd, workspaces });
    log(`Found ${files.length} files in workspaces`);

    for (const plugin of plugins) {
      log('Processing plugin');
      let workspaces = await plugin.getWorkspaces({ cwd: cwd, files });
      log(`Plugin found ${workspaces.length} workspaces`);

      for (const workspace of workspaces) {
        log(`Processing workspace: ${workspace.workspaceName} at ${workspace.workspacePath}`);
        const workspacePackageJsonPath = join(workspace.workspacePath, 'package.json');
        const workspacePackageJson = await readJson<PackageJson>(workspacePackageJsonPath) ?? { name: workspace.workspaceName };
        log(`Found existing package.json: ${workspacePackageJson ? 'yes' : 'no'}`);

        const updatedPackageJson = await plugin.updateWorkspace({ cwd: cwd, packageJson: workspacePackageJson, ...workspace }) ?? { name: workspace.workspaceName };
        if (hasPackageJsonChanged(workspacePackageJson, updatedPackageJson)) {
          log(`Changes detected in ${workspace.workspaceName}, writing updated package.json`);
          await writeJson(workspacePackageJsonPath, updatedPackageJson);
        } else {
          log(`No changes detected for ${workspace.workspaceName}`);
        }
      }
    }

    log('Command completed');
  });

export function turboSyncCommand() {
  log('Parsing command line arguments');
  program.parse(process.argv);
}