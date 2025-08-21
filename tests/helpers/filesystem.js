// filepath: c:\Projects\turbo-sync\tests\helpers\filesystem.js
import mockFs from 'mock-fs';
import path from 'path';
import fs from 'node:fs';

export function setupMemFs(initialStructure = {}) {
	// Create a mock filesystem with the initial structure
	mockFs(initialStructure);

	return {
		restore: () => mockFs.restore(),
		getFileContent: (filePath) => {
			try {
				return fs.readFileSync(filePath, 'utf8');
			} catch (error) {
				return null;
			}
		}
	};
}