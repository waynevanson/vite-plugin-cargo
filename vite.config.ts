import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import dts from "unplugin-dts/vite";

const builtInNodeModules = [
	...builtinModules,
	...builtinModules.map((builtinModule) => `node:${builtinModule}`),
];

export default defineConfig({
	build: {
		lib: {
			entry: "src/index.ts",
			formats: ["es"],
			fileName: "index",
		},
		outDir: "dist",
		rollupOptions: {
			external: [...builtInNodeModules, /node_modules/],
			output: { preserveModules: true, sourcemap: true },
		},
	},
	plugins: [dts({})],
});
