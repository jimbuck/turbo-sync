import { TurboSyncPluginDefinition, TurboSyncWorkspaceResult } from '../types.js';
import { dotnetPlugin } from './dotnet.js';
import { rustPlugin } from './rust.js';


export const plugins = [
	dotnetPlugin,
	rustPlugin,
] as unknown as TurboSyncPluginDefinition<TurboSyncWorkspaceResult>[];