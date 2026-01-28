import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { setupMemFs } from '../helpers/filesystem.js';
import { ProjectBuilder } from '../helpers/project-builder.js';
import { assertPackageJsonHasScripts } from '../helpers/assertions.js';

describe('dotnet plugin', () => {
	let memFs: any;

	beforeEach(() => {
		// memFs will be set up per test with the required file structure
	});

	afterEach(() => {
		memFs?.restore();
		vi.resetModules();
	});

	test('should detect library projects', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace')
			.withDotNetProject('lib', 'lib');

		memFs = setupMemFs(builder.build());

		// Import the plugin after setting up mocks
		const { dotnetPlugin } = await import('../../src/plugins/dotnet.js');

		// Initialize the plugin
		const plugin = dotnetPlugin.build({});

		// Act
		const files = ['/workspace/lib/lib.csproj'];
		const workspaces = await plugin.getWorkspaces({ cwd: '/workspace', files });

		// Assert
		expect(workspaces).toHaveLength(1);
		expect(workspaces[0].workspaceName).toBe('@lib/lib');

		// Check package.json generation
		const packageJson = await plugin.updateWorkspace({
			cwd: '/workspace',
			isPnpm: false,
			packageJson: { name: '@lib/lib' },
			...workspaces[0]
		});

		expect(packageJson).toBeDefined();
		assertPackageJsonHasScripts(packageJson, {
			'clean': 'dotnet clean',
			'build': 'dotnet build',
			'typecheck': 'dotnet build'
		});
	});

	test('should detect app projects', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace')
			.withDotNetProject('api', 'app');

		memFs = setupMemFs(builder.build());

		// Import the plugin after setting up mocks
		const { dotnetPlugin } = await import('../../src/plugins/dotnet.js');

		// Initialize the plugin
		const plugin = dotnetPlugin.build({});

		// Act
		const files = ['/workspace/api/api.csproj'];
		const workspaces = await plugin.getWorkspaces({ cwd: '/workspace', files });

		// Assert
		expect(workspaces).toHaveLength(1);

		// Check package.json generation
		const packageJson = await plugin.updateWorkspace({
			cwd: '/workspace',
			isPnpm: false,
			packageJson: { name: '@api/api' },
			...workspaces[0]
		});

		expect(packageJson).toBeDefined();
		assertPackageJsonHasScripts(packageJson, {
			'dev': 'dotnet run',
			'clean': 'dotnet clean',
			'build': 'dotnet build',
			'typecheck': 'dotnet build'
		});
	});

	test('should handle dependencies between projects', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace')
			.withDotNetProject('api', 'app')
			.withDotNetProject('core', 'lib');

		// Add project reference
		builder.withFile('api/api.csproj', `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../core/core.csproj" />
  </ItemGroup>
</Project>`);

		memFs = setupMemFs(builder.build());

		// Import the plugin after setting up mocks
		const { dotnetPlugin } = await import('../../src/plugins/dotnet.js');

		// Initialize the plugin
		const plugin = dotnetPlugin.build({});

		// Act
		const files = ['/workspace/api/api.csproj', '/workspace/core/core.csproj'];
		const workspaces = await plugin.getWorkspaces({ cwd: '/workspace', files });

		// Process the api project which depends on core
		const apiWorkspace = workspaces.find(w => w.workspaceName === '@api/api');
		expect(apiWorkspace).toBeDefined();

		const packageJson = await plugin.updateWorkspace({
			cwd: '/workspace',
			isPnpm: true,
			packageJson: { name: '@api/api' },
			...apiWorkspace!
		});

		// Assert
		expect(packageJson?.dependencies).toHaveProperty('@core/core');
		expect(packageJson?.dependencies?.['@core/core']).toBe('workspace:*');
	});
});