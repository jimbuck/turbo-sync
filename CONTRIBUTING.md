# Contributing to turborepo-sync

## Development Setup

```sh
git clone https://github.com/jimbuck/turborepo-sync.git
cd turborepo-sync
npm install
npm run build
```

## Running Tests

```sh
npm test
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
```

## Plugin Development Guide

To develop a new plugin for the `turborepo-sync` CLI tool, follow these steps:

1. Create a new TypeScript file in the `src/plugins/` directory (e.g., `src/plugins/myplugin.ts`)
2. Implement the `TurboSyncPluginDefinition` interface by creating a plugin definition object
3. Export your plugin definition
4. Register the plugin by adding it to the plugins array in `src/plugins/index.ts`

Here is an example of a simple plugin implementation:

```typescript
import { join, basename, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import debug from 'debug';
import { PackageJson, TurboSyncConfig, TurboSyncPlugin, TurboSyncPluginDefinition, TurboSyncWorkspaceResult } from '../types.js';

const log = debug('turborepo-sync:plugin:myplugin');

// Define plugin-specific configuration interface (optional)
export interface MyPluginConfig {
  scripts?: Record<string, string>;
}

// Define plugin-specific workspace result interface (optional)
export interface MyWorkspaceResult extends TurboSyncWorkspaceResult {
  projectFile: string;
}

// Create the plugin definition
export const myPlugin: TurboSyncPluginDefinition<MyWorkspaceResult> = {
  name: 'myplugin',
  workspaceFiles: ['*.myext'],  // File patterns to look for
  ignore: ['**/temp/**'],       // Patterns to ignore

  build(config: TurboSyncConfig) {
    // Extract plugin-specific config
    const myConfig = (config.myplugin ?? {}) as MyPluginConfig;
    log('Initializing my plugin with config:', myConfig);

    // Return a plugin object that implements the TurboSyncPlugin interface
    return {
      // Find workspaces based on the files discovered
      getWorkspaces: async ({ files }) => {
        log(`Processing ${files.length} files`);

        return files.map(file => ({
          workspacePath: dirname(file),
          workspaceName: `@my/${basename(dirname(file))}`,
          projectFile: file
        })) as MyWorkspaceResult[];
      },

      // Update package.json for each workspace
      updateWorkspace: async ({ packageJson, projectFile }) => {
        log(`Updating package.json for project: ${projectFile}`);

        // Read and parse your project file here
        const content = await readFile(projectFile, 'utf-8');
        // ... process content ...

        // Return updated package.json
        return {
          ...packageJson,
          scripts: {
            ...packageJson.scripts,
            ...myConfig.scripts,
            'custom-script': 'echo "Hello from my plugin"'
          }
        };
      }
    } as TurboSyncPlugin<MyWorkspaceResult>;
  }
};
```

After creating your plugin, add it to the plugins list in `src/plugins/index.ts`:

```typescript
import { dotnetPlugin } from './dotnet.js';
import { rustPlugin } from './rust.js';
import { myPlugin } from './myplugin.js';

export const plugins = [
  dotnetPlugin,
  rustPlugin,
  myPlugin,
];
```
