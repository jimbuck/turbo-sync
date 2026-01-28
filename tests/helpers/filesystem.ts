import { createMemFS, FileSystemHelper } from './memory-fs.js';

export { FileSystemHelper } from './memory-fs.js';

export function setupMemFs(initialStructure: Record<string, string> = {}): FileSystemHelper {
	return createMemFS(initialStructure);
}