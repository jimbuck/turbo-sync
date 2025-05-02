# turbo-sync

One repo, many languages, zero headaches!

## Why turbo-sync?

Managing monorepos with multiple languages can be a real headache. Turborepo works great for JavaScript projects, but once you start adding .NET, Python, or other languages to the mix, things get complicated fast.

When you have a mix of JS and non-JS projects, you end up with two worlds that don't talk to each other:

- Your JS projects with neat package.json files and script commands
- Your other projects (.NET, Python, etc.) that Turborepo doesn't understand

This leads to inconsistent workflows, broken dependency graphs, and that frustrating feeling of "why can't all my projects just work together?"

That's where turbo-sync comes in! It bridges the gap by automatically:

1. Discovering your non-JS projects (.NET, etc.)
2. Creating or updating package.json files for them
3. Adding appropriate scripts based on project type
4. Mapping dependencies correctly in your workspace

The result? A unified workflow where `turbo build` or `turbo test` just works across your entire codebase, regardless of language. Your dependency graph becomes complete, incremental builds work properly, and you get all the benefits of Turborepo for your entire project.

No more context switching between different build systems or remembering different commands for different project types. Just a smooth, consistent developer experience across your whole monorepo.

## Installation

To install the `turbo-sync` CLI tool from npm, run the following command:

```sh
npm install -g turbo-sync
```

## Usage

The `turbo-sync` command can be used to update `package.json` files for non-JS projects in a turborepo repository.

### Update all projects

To update all projects in the repository, run the following command:

```sh
turbo-sync
```

### Specify a custom root directory

By default, `turbo-sync` uses the current working directory as the root. To specify a different root directory:

```sh
turbo-sync /path/to/your/repo
```

### Enable Debug Logging

To enable debug logging for troubleshooting, use the `--debug` flag:

```sh
turbo-sync --debug
```

You can also enable debug logging by setting the DEBUG environment variable:

```sh
# On Windows
set DEBUG=turbo-sync:*
turbo-sync

# On Linux/macOS
DEBUG=turbo-sync:* turbo-sync
```

## Configuration

The `turbo-sync` CLI tool reads custom configuration from the `turbo-sync` property in the root `package.json`. Here is an example configuration:

```json
{
  "workspaces": ["workspace1", "workspace2", "path/to/project"],
  "turbo-sync": {}
}
```

## Plugins

### .NET

The dotnet plugin automatically discovers .NET projects (csproj, fsproj, vbproj) in your repository and creates or updates the corresponding `package.json` files with appropriate scripts and dependencies.

#### Features

- **Project Type Detection**: Automatically detects whether a project is an application, library, test, or E2E test project.
- **Script Generation**: Adds appropriate npm scripts based on the detected project type.
- **Dependency Resolution**: Analyzes project references to add workspace dependencies.

#### Default Project Types

The plugin recognizes the following project types:

- **app**: Web applications and console applications
- **lib**: Class libraries
- **test**: Unit test projects
- **e2e**: End-to-end and integration test projects

#### Default Scripts

The following scripts are assigned to projects based on their type:

| Script      | Command             | Project Types       |
| ----------- | ------------------- | ------------------- |
| `dev`       | `dotnet run`        | app                 |
| `clean`     | `dotnet clean`      | app, lib, test, e2e |
| `build`     | `dotnet build`      | app, lib, test, e2e |
| `typecheck` | `dotnet build`      | app, lib, test, e2e |
| `test`      | `dotnet test`       | test                |
| `e2e`       | `dotnet watch test` | e2e                 |

#### Configuration

You can override the default scripts and script assignments in the `turbo-sync.dotnet` configuration:

```json
{
  "turbo-sync": {
    "dotnet": {
      "scripts": {
        "dev": "dotnet watch run",
        "build": "dotnet build --configuration Release"
      },
      "scriptAssignments": {
        "app": ["dev", "clean", "build"],
        "lib": ["clean", "build"],
        "test": ["clean", "build", "test"],
        "e2e": ["clean", "build", "e2e"]
      }
    }
  }
}
```

## Plugin Development Guide

To develop a new plugin for the `turbo-sync` CLI tool, follow these steps:

1. Create a new TypeScript file in the `src/plugins/` directory (e.g., `src/plugins/myplugin.ts`)
2. Implement the `TurboSyncPlugin` interface by creating a factory function that returns a plugin object
3. Export your plugin as the default export
4. Register the plugin by adding it to the plugins array in `src/plugins/index.ts`

Here is an example of a simple plugin implementation:

```typescript
import { join } from 'node:path';
import debug from 'debug';
import { PackageJson, TurboSyncConfig, TurboSyncPlugin, TurboSyncWorkspaceResult } from '../types.js';

// Define plugin-specific configuration interface (optional)
export interface MyPluginConfig {
  customSetting?: string;
}

// Define plugin-specific workspace result interface (optional)
export interface MyWorkspaceResult extends TurboSyncWorkspaceResult {
  extraData: string;
}

// Create a factory function that returns a plugin object
const myPlugin = (config: TurboSyncConfig) => {
  // Extract plugin-specific config
  const myConfig = (config.myplugin ?? {}) as MyPluginConfig;
  const log = debug('turbo-sync:plugin:myplugin');
  
  log('Initializing my plugin with config:', myConfig);

  // Return a plugin object that implements the TurboSyncPlugin interface
  return {
    name: 'myplugin',
    workspaceFiles: ['*.myext'],  // File patterns to look for
    ignore: ['**/temp/**'],       // Patterns to ignore
    
    // Find workspaces based on the files discovered
    getWorkspaces: async ({ files }) => {
      log(`Processing ${files.length} files`);
      
      return files.map(file => ({
        workspacePath: join(file, '..'),
        workspaceName: `my-${file.split('/').pop()}`,
        extraData: 'some-value'
      })) as MyWorkspaceResult[];
    },
    
    // Update package.json for each workspace
    updateWorkspace: async ({ packageJson, workspacePath, extraData }) => {
      log(`Updating package.json for workspace: ${workspacePath}`);
      
      return {
        ...packageJson,
        scripts: {
          ...packageJson.scripts,
          'custom-script': 'echo "Hello from custom script"'
        }
      };
    }
  } as TurboSyncPlugin<MyWorkspaceResult>;
};

export default myPlugin;
```

After creating your plugin, add it to the plugins list in `src/plugins/index.ts`:

```typescript
import dotnetPlugin from './dotnet.js';
import myPlugin from './myplugin.js';

export const plugins = [
  dotnetPlugin,
  myPlugin,
] as const;
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
