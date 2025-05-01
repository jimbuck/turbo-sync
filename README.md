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

### Update specific projects

To update specific projects, use the `--filter` or `-F` option with workspace names, wildcards, or folder paths. For example:

```sh
turbo-sync --filter workspace1
turbo-sync -F workspace1 -F workspace2
turbo-sync --filter path/to/project
```

## Configuration

The `turbo-sync` CLI tool reads custom configuration from the `turbo-sync` property in the root `package.json`. Here is an example configuration:

```json
{
  "turbo-sync": {
    "workspaces": [
      "workspace1",
      "workspace2",
      "path/to/project"
    ],
    "dotnet": {
      "someConfig": "value"
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
import { Plugin } from '../types';

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
