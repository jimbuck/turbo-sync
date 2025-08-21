# turbo-sync

One repo, many languages, zero headaches!

## Why turbo-sync?

Managing monorepos with multiple languages can be a real headache. Turborepo works great for JavaScript projects, but once you start adding .NET, Rust, or other languages to the mix, things get complicated fast.

When you have a mix of JS and non-JS projects, you end up with two worlds that don't talk to each other:

- Your JS projects with neat package.json files and script commands
- Your other projects (.NET, Rust, etc.) that Turborepo doesn't understand

This leads to inconsistent workflows, broken dependency graphs, and that frustrating feeling of "why can't all my projects just work together?"

That's where turbo-sync comes in! It bridges the gap by automatically:

1. Discovering your non-JS projects (.NET, Rust, etc.)
2. Creating or updating package.json files for them
3. Adding appropriate scripts based on project type
4. Mapping dependencies correctly in your workspace
5. Supporting custom configuration and metadata

The result? A unified workflow where `turbo build` or `turbo test` just works across your entire codebase, regardless of language. Your dependency graph becomes complete, incremental builds work properly, and you get all the benefits of Turborepo for your entire project.

No more context switching between different build systems or remembering different commands for different project types. Just a smooth, consistent developer experience across your whole monorepo.

## Status

turbo-sync is currently under active development with the following features implemented:

✅ **Core Architecture**
- Plugin-based architecture for extensibility
- Automatic project discovery
- Package.json generation and updates
- Workspace dependency resolution

✅ **.NET Support**
- Automatic detection of .csproj, .fsproj, and .vbproj files
- Project type detection (app, library, test, e2e)
- Project reference dependency mapping
- Customizable scripts via configuration

✅ **Rust Support**
- Automatic detection of Cargo.toml files
- Path dependency analysis and workspace mapping
- Custom naming and scripts via Cargo.toml metadata
- Standard Cargo command integration

✅ **Testing**
- Comprehensive test suite with 100% pass rate
- In-memory filesystem for fast, isolated testing
- Plugin-specific test coverage

## Installation

> **Note:** This CLI tool is currently in development. To use it, clone the repository and build it locally.

```sh
git clone <repository-url>
cd turbo-sync
npm install
npm run build
```

You can then run it locally with:

```sh
node dist/bin.js
```

Or install globally from the built version:

```sh
npm install -g .
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

turbo-sync uses a plugin architecture to support different project types. Currently supported:

### .NET Plugin

The dotnet plugin automatically discovers .NET projects (csproj, fsproj, vbproj) in your repository and creates or updates the corresponding `package.json` files with appropriate scripts and dependencies.

#### Features

- **Project Type Detection**: Automatically detects whether a project is an application, library, test, or E2E test project.
- **Script Generation**: Adds appropriate npm scripts based on the detected project type.
- **Dependency Resolution**: Analyzes project references to add workspace dependencies.
- **Custom Configuration**: Override default scripts and behaviors via configuration.

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

### Rust Plugin

The Rust plugin automatically discovers Rust projects (Cargo.toml) in your repository and creates or updates the corresponding `package.json` files with appropriate scripts and dependencies.

#### Features

- **Automatic Discovery**: Finds all Cargo.toml files in your workspace.
- **Default Scripts**: Adds standard Cargo commands as npm scripts.
- **Workspace Dependencies**: Analyzes path dependencies in Cargo.toml to create workspace dependencies.
- **Custom Metadata**: Supports custom naming and scripts via Cargo.toml metadata sections.

#### Default Scripts

The following scripts are automatically added to Rust projects:

| Script  | Command         | Description                    |
| ------- | --------------- | ------------------------------ |
| `build` | `cargo build`   | Build the project              |
| `test`  | `cargo test`    | Run tests                      |
| `clean` | `cargo clean`   | Clean build artifacts          |
| `dev`   | `cargo run`     | Run the project in dev mode    |

#### Workspace Dependencies

If your Cargo.toml contains path dependencies like:

```toml
[dependencies]
my-util = { path = "../util-crate" }
```

The plugin will automatically add the corresponding workspace dependency to package.json:

```json
{
  "dependencies": {
    "@rust/my-util": "workspace:*"
  }
}
```

#### Custom Configuration via Cargo.toml

You can customize the generated package.json by adding metadata to your Cargo.toml:

```toml
[package]
name = "my-crate"
version = "0.1.0"

[package.metadata.turbo-sync]
name = "custom-package-name"

[package.metadata.turbo-sync.scripts]
build = "cargo build --release"
test = "cargo test -- --nocapture"
```

This will generate a package.json with the custom name and scripts instead of the defaults.

## Plugin Development Guide

To develop a new plugin for the `turbo-sync` CLI tool, follow these steps:

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

const log = debug('turbo-sync:plugin:myplugin');

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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
