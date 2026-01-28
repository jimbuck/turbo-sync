# turborepo-sync

One repo, many languages, zero headaches!

## Why turborepo-sync?

Turborepo doesn't know about your non-JS projects. turborepo-sync fixes that by generating/updating `package.json` files for .NET, Rust, and other projects — including their cross-project dependencies — so `turbo build` and `turbo test` work across your entire monorepo.

## Installation

Run it directly with npx:

```sh
npx turborepo-sync
```

Or install it globally:

```sh
# npm
npm install -g turborepo-sync

# pnpm
pnpm add -g turborepo-sync

# yarn
yarn global add turborepo-sync
```

## Usage

The `turborepo-sync` command can be used to update `package.json` files for non-JS projects in a turborepo repository.

### Update all projects

To update all projects in the repository, run the following command:

```sh
turborepo-sync
```

### Specify a custom root directory

By default, `turborepo-sync` uses the current working directory as the root. To specify a different root directory:

```sh
turborepo-sync /path/to/your/repo
```

### Enable Debug Logging

To enable debug logging for troubleshooting, use the `--debug` flag:

```sh
turborepo-sync --debug
```

You can also enable debug logging by setting the DEBUG environment variable:

```sh
# On Windows
set DEBUG=turborepo-sync:*
turborepo-sync

# On Linux/macOS
DEBUG=turborepo-sync:* turborepo-sync
```

## Configuration

The `turborepo-sync` CLI tool reads custom configuration from the `turborepo-sync` property in the root `package.json`. Here is an example configuration:

```json
{
  "workspaces": ["workspace1", "workspace2", "path/to/project"],
  "turborepo-sync": {}
}
```

## Plugins

turborepo-sync uses a plugin architecture to support different project types. Currently supported:

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

You can override the default scripts and script assignments in the `turborepo-sync.dotnet` configuration:

```json
{
  "turborepo-sync": {
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

[package.metadata.turborepo-sync]
name = "custom-package-name"

[package.metadata.turborepo-sync.scripts]
build = "cargo build --release"
test = "cargo test -- --nocapture"
```

This will generate a package.json with the custom name and scripts instead of the defaults.


## Status

turborepo-sync is currently under active development with the following features implemented:

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


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for information on developing plugins and contributing to the project.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
