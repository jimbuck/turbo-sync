import mock from 'mock-fs';
import { join } from 'node:path';

export interface FileSystemHelper {
	restore: () => void;
}

export function setupMemFs(initialStructure: Record<string, string> = {}): FileSystemHelper {

	// Setup the mock file system
	mock({
		'package.json': mock.load(join(__dirname, '../../package.json')),
		node_modules: mock.load(join(__dirname, '../../node_modules')),
		src: mock.load(join(__dirname, '../../src')),
		tests: mock.load(join(__dirname, '../../tests')),
		dist: mock.load(join(__dirname, '../../dist')),
		...initialStructure,
	});

	return {
		restore: () => mock.restore()
	};
}