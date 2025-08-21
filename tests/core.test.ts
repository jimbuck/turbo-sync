import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { setupMemFs } from './helpers/filesystem.js';
import { ProjectBuilder } from './helpers/project-builder.js';
import { assertPackageJsonExists } from './helpers/assertions.js';


describe('turboSync core functionality', () => {
	let memFs: any;

	beforeEach(async () => {
		memFs = setupMemFs();

		const { readdir } = await import('node:fs/promises');

		const structure = {};
		await getFSStructure('/', structure, 0);
		console.log(Object.keys(structure)); // Log the structure for debugging

		async function getFSStructure(cwd: string, structure: Record<string, any>, level: number) {
			const files = await readdir('/', { withFileTypes: true });
			for (const file of files) {
				if (file.isDirectory() && level < 2) {
					structure[file.name] = {};
					await getFSStructure(`${cwd}/${file.name}`, structure[file.name], level + 1);
				}
			}
		}
	});

	afterEach(() => {
		memFs.restore();
		vi.resetModules();
	});

	test('should process simple repo with mixed project types', async () => {
		// Arrange
		const projectFiles = new ProjectBuilder('/workspace')
			.withWorkspaces(['packages/*'])
			.withDotNetProject('packages/api', 'app')
			.withRustProject('packages/core')
			.withJsProject('packages/ui', { 'react': '18.0.0' })
			.build();

		memFs = setupMemFs(projectFiles);

		// Import the module after setting up mocks
		const { turboSync } = await import('../src/index.js');

		// Act
		await turboSync({ cwd: '/workspace' });

		// Assert
		const dotnetPackageJson = assertPackageJsonExists(memFs, '/workspace/packages/api');
		expect(dotnetPackageJson.name).toBe('@api/api');
		expect(dotnetPackageJson.scripts).toHaveProperty('dev');

		const rustPackageJson = assertPackageJsonExists(memFs, '/workspace/packages/core');
		expect(rustPackageJson.name).toBe('@rust/core');
		expect(rustPackageJson.scripts).toHaveProperty('build');
	});

	test('should respect existing package.json files', async () => {
		// Arrange
		const builder = new ProjectBuilder('/workspace')
			.withWorkspaces(['packages/*'])
			.withDotNetProject('packages/lib', 'lib');

		// Add existing package.json
		builder.withFile('packages/lib/package.json', JSON.stringify({
			name: 'custom-name',
			scripts: {
				special: 'echo "custom script"'
			}
		}, null, 2));

		memFs = setupMemFs(builder.build());

		// Import the module after setting up mocks
		const { turboSync } = await import('../src/index.js');

		// Act
		await turboSync({ cwd: '/workspace' });

		// Assert
		const packageJson = assertPackageJsonExists(memFs, '/workspace/packages/lib');
		expect(packageJson.name).toBe('custom-name'); // Should preserve custom name
		expect(packageJson.scripts).toHaveProperty('special', 'echo "custom script"');
		expect(packageJson.scripts).toHaveProperty('build', 'dotnet build'); // Should add standard scripts
	});

	test('should process custom config', async () => {
		// Arrange
		const projectFiles = new ProjectBuilder('/workspace')
			.withWorkspaces(['packages/*'])
			.withTurboSyncConfig({
				dotnet: {
					scripts: {
						build: 'dotnet build --configuration Release'
					}
				}
			})
			.withDotNetProject('packages/lib', 'lib')
			.build();

		memFs = setupMemFs(projectFiles);

		// Import the module after setting up mocks
		const { turboSync } = await import('../src/index.js');

		// Act
		await turboSync({ cwd: '/workspace' });

		// Assert
		const packageJson = assertPackageJsonExists(memFs, '/workspace/packages/lib');
		expect(packageJson.scripts.build).toBe('dotnet build --configuration Release');
	});
});