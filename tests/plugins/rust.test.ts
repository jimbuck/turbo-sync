import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { FileSystemHelper, setupMemFs } from '../helpers/filesystem.js';
import { ProjectBuilder } from '../helpers/project-builder.js';
import { assertPackageJsonHasScripts } from '../helpers/assertions.js';

describe('rust plugin', () => {
	let memFs: FileSystemHelper;

	beforeEach(() => {
		// memFs will be set up per test with the required file structure
	});

	afterEach(() => {
		memFs?.restore();
		vi.resetModules();
	});

	test('should detect rust projects', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace')
			.withRustProject('crate-a');

		memFs = setupMemFs(builder.build());

		// Import the plugin after setting up mocks
		const { rustPlugin } = await import('../../src/plugins/rust.js');

		// Initialize the plugin
		const plugin = rustPlugin.build({});

		// Act
		const files = ['/workspace/crate-a/Cargo.toml'];
		const workspaces = await plugin.getWorkspaces({ cwd: '/workspace', files });

		// Assert
		expect(workspaces).toHaveLength(1);
		expect(workspaces[0].workspaceName).toBe('@rust/crate-a');

		// Check package.json generation
		const packageJson = await plugin.updateWorkspace({
			cwd: '/workspace',
			isPnpm: false,
			packageJson: { name: '@rust/crate-a' },
			...workspaces[0]
		});

		expect(packageJson).toBeDefined();
		assertPackageJsonHasScripts(packageJson, {
			'build': 'cargo build',
			'test': 'cargo test',
			'clean': 'cargo clean',
			'dev': 'cargo run'
		});
	});

	test('should handle rust workspace dependencies', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace')
			.withRustProject('main-crate')
			.withRustProject('util-crate');

		// Add dependency in Cargo.toml
		builder.withFile('main-crate/Cargo.toml', `
[package]
name = "main-crate"
version = "0.1.0"
edition = "2021"

[dependencies]
util-crate = { path = "../util-crate" }
`);

		memFs = setupMemFs(builder.build());

		// Import the plugin after setting up mocks
		const { rustPlugin } = await import('../../src/plugins/rust.js');

		// Initialize the plugin
		const plugin = rustPlugin.build({});

		// Act
		const files = ['/workspace/main-crate/Cargo.toml', '/workspace/util-crate/Cargo.toml'];
		const workspaces = await plugin.getWorkspaces({ cwd: '/workspace', files });

		// Process the main crate which depends on util-crate
		const mainWorkspace = workspaces.find(w => w.workspaceName === '@rust/main-crate');
		expect(mainWorkspace).toBeDefined();

		const packageJson = await plugin.updateWorkspace({
			cwd: '/workspace',
			isPnpm: true,
			packageJson: { name: '@rust/main-crate' },
			...mainWorkspace!
		});

		// Assert
		expect(packageJson?.dependencies).toHaveProperty('@rust/util-crate');
		expect(packageJson?.dependencies?.['@rust/util-crate']).toBe('workspace:*');
	});

	test('should parse custom settings from Cargo.toml', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace');

		// Add Cargo.toml with custom metadata
		builder.withFile('custom-crate/Cargo.toml', `
[package]
name = "custom-crate"
version = "0.1.0"
edition = "2021"

[package.metadata.turbo-sync]
name = "custom-package-name"

[package.metadata.turbo-sync.scripts]
build = "cargo build --release"
test = "cargo test -- --nocapture"

[dependencies]
`);

		memFs = setupMemFs(builder.build());

		// Import the plugin after setting up mocks
		const { rustPlugin } = await import('../../src/plugins/rust.js');

		// Initialize the plugin
		const plugin = rustPlugin.build({});

		// Act
		const files = ['/workspace/custom-crate/Cargo.toml'];
		const workspaces = await plugin.getWorkspaces({ cwd: '/workspace', files });

		// Assert
		expect(workspaces).toHaveLength(1);
		expect(workspaces[0].workspaceName).toBe('custom-package-name');

		// Check package.json generation with custom settings
		const packageJson = await plugin.updateWorkspace({
			cwd: '/workspace',
			isPnpm: false,
			packageJson: { name: 'custom-package-name' },
			...workspaces[0]
		});

		expect(packageJson).toBeDefined();
		assertPackageJsonHasScripts(packageJson, {
			'build': 'cargo build --release',
			'test': 'cargo test -- --nocapture'
		});
	});
});