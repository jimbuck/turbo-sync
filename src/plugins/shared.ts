import { glob } from 'fast-glob';
import debug from 'debug';

const log = debug('turbo-sync:shared');

export const IGNORE_FILES = ['**/node_modules/**', '**/bin/**', '**/obj/**'];

export async function getWorkspaceFiles({ cwd, workspaces }: { cwd: string; workspaces: string[] }) {
	log(`Getting workspace files in ${cwd} for patterns: ${workspaces.join(', ')}`);
	log(`Using ignore patterns: ${IGNORE_FILES.join(', ')}`);

	const files = await glob(workspaces, {
		cwd,
		onlyFiles: true,
		absolute: true,
		ignore: IGNORE_FILES,
	});

	log(`Found ${files.length} files`);
	return files;
}