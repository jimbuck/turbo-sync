import { expect } from 'vitest';
import path from 'path';

interface FileSystemHelper {
	getFileContent: (path: string) => string | null;
}

export function assertPackageJsonExists(fs: FileSystemHelper, projectPath: string) {
	const content = fs.getFileContent(path.join(projectPath, 'package.json'));
	expect(content).not.toBeNull();
	return JSON.parse(content as string);
}

export function assertPackageJsonHasScripts(packageJson: any, expectedScripts: Record<string, string>) {
	expect(packageJson).toHaveProperty('scripts');

	for (const [scriptName, scriptCommand] of Object.entries(expectedScripts)) {
		expect(packageJson.scripts).toHaveProperty(scriptName);
		expect(packageJson.scripts[scriptName]).toBe(scriptCommand);
	}
}

export function assertPackageJsonHasDependencies(packageJson: any, expectedDependencies: string[]) {
	expect(packageJson).toHaveProperty('dependencies');

	for (const dependency of expectedDependencies) {
		expect(packageJson.dependencies).toHaveProperty(dependency);
	}
}