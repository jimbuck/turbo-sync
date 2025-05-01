import fastGlob from 'fast-glob';
import debug from 'debug';
import pMap from 'p-map';

const { glob } = fastGlob;

const log = debug('turbo-sync:shared');

export const IGNORE_FILES = ['**/node_modules/**', '**/bin/**', '**/obj/**'];

export async function getWorkspaceFiles({ cwd, workspaces, workspaceFiles }: { cwd: string; workspaces: string[], workspaceFiles: string[] }) {
	log(`Getting workspace files in ${cwd} for patterns: ${workspaces.join(', ')}`);
	log(`Using ignore patterns: ${IGNORE_FILES.join(', ')}`);
	log(`Using workspace files: ${workspaceFiles.join(', ')}`);

	if (!workspaces) return [];

	const ignoredGlobs = workspaces
		.filter((glob) => glob.startsWith("!"))
		.map((glob) => glob.slice(1));

	const includeGlobs = workspaces.filter((glob) => !glob.startsWith("!"));

	const files = await pMap(workspaceFiles.flatMap(workspaceFile => includeGlobs.map(glob => `${glob}/${workspaceFile}`)), async (workspaceGlob) => {
		return await glob(workspaceGlob, {
			cwd,
			onlyFiles: true,
			absolute: true,
			ignore: [...IGNORE_FILES, ...ignoredGlobs],
		});
	}, { concurrency: 4 });

	return files.flat();
}