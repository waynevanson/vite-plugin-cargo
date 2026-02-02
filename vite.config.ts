import { builtinModules } from "node:module";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

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
		},
		sourcemap: true,
	},
	plugins: [dts({ bundleTypes: true })],
});
