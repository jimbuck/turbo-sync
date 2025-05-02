import dotnetPlugin from './dotnet.js';
import rustPlugin from './rust.js';


export const plugins = [
	dotnetPlugin,
	rustPlugin,
] as const;