# turbo-sync

A tool for managing multi-language workspaces in turborepo.

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

1. Create a new TypeScript file in the `src/plugins/` directory.
2. Implement the plugin interface by defining methods for initializing the plugin and updating `package.json`.
3. Register the plugin with the CLI tool by adding it to the list of plugins in `src/commands/turbo-sync.ts`.

Here is an example of a simple plugin implementation:

```typescript
import { Plugin } from "../types";

export class ExamplePlugin implements Plugin {
  async initialize(config: any) {
    // Initialize the plugin with the provided configuration
  }

  async updatePackageJson(packageJson: any) {
    // Update the package.json file
  }
}
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
