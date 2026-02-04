# vite-plugin-cargo

A Vite plugin that seamlessly integrates Rust crates into your frontend project by compiling them to WebAssembly via `cargo` and `wasm-bindgen`.

## Features

- **Zero-Config Compiling**: Automatically detects the closest `Cargo.toml`.
- **Watch mode**: Watches dependencies related to the entrypoint.
- **WASM-Bindgen Integration**: Generates the necessary JS glue code automatically.
- **TypeScript Support**: Automatically generates and syncs `.d.ts` files for your Rust exports.
- **HMR Support**: Works with Vite's dev server.
- **Release Optimization**: Automatically uses `--release` builds during `vite build`.

## Prerequisites

You must have the following installed on your system:

1. [Rust and Cargo](https://rustup.rs/)
2. `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
3. [`wasm-bindgen-cli`](<https://www.google.com/search?q=%5Bhttps://github.com/rustwasm/wasm-bindgen%5D(https://github.com/rustwasm/wasm-bindgen)>): `cargo install -f wasm-bindgen-cli`

## Installation

```bash
npm install @waynevanson/vite-plugin-cargo --save-dev

```

## Usage

### 1. Configure Vite

Add the plugin to your `vite.config.ts`. You must specify which files should be treated as Rust entrypoints using a glob pattern.

```typescript
import { defineConfig } from "vite";
import { cargo } from "vite-plugin-cargo";

export default defineConfig({
  plugins: [
    cargo({
      // Files to treat as Cargo entrypoints
      includes: ["**/src/lib.rs"],
    }),
  ],
});
```

### 2. Prepare your Rust code

Ensure your Rust crate is configured as a `cdylib`.

**Cargo.toml**

```toml
[package]
name = "my-rust-lib"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

```

**src/lib.rs**

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

```

### 3. Import in JS/TS

```typescript
import { greet } from "./src/lib.rs";

console.log(greet("Vite"));
```

## Configuration Options

### Base Configuration

| Option                | Type                                     | Description                                      |
| :-------------------- | :--------------------------------------- | :----------------------------------------------- |
| `includes`            | `string \| string[]`                     | Glob patterns of possible entry points.          |
| `browserOnly`         | `boolean`                                | (Optional) Passes `--browser` to `wasm-bindgen`. |
| `noTypescript`        | `boolean`                                | (Optional) Disables `.d.ts` generation.          |
| `cargoBuildOverrides` | `(args: Array<string>) => Array<string>` | (Optional) Override args to `cargo build`.       |

### Rust Features

Additionally, one of the following configurations can be used with the base.

| Option              | Type       | Description                                  |
| :------------------ | :--------- | :------------------------------------------- |
| `features`          | `string[]` | (Optional) List of Cargo features to enable. |
| `noDefaultFeatures` | `boolean`  | (Optional) Disable default Cargo features.   |

| Option        | Type      | Description                           |
| :------------ | :-------- | :------------------------------------ |
| `allFeatures` | `boolean` | (Optional) Enable all Cargo features. |

---

## How it works

Transformation pipeline:

```js
`.rs` -> `.wasm` + `.js` + `.d.ts`
```

1. **Detection**: The plugin matches files via the `includes` glob.
2. **Metadata**: It runs `cargo metadata` to find the correct `cdylib` target.
3. **Compilation**: Runs `cargo build --target wasm32-unknown-unknown`.
4. **Binding**: Runs `wasm-bindgen` on the resulting `.wasm` file to a local cache in `node_modules/.cache`.
5. **Resolution**: Injects the generated JavaScript glue code into your Vite bundle.
