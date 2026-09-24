import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const threePackageDirectory = resolve(dirname(require.resolve("three")), "..");
const decoderDirectory = resolve(threePackageDirectory, "examples/jsm/libs/draco");
const outputDirectory = resolve(frontendDirectory, "public/vendor/three-draco");
const decoderFiles = ["draco_wasm_wrapper.js", "draco_decoder.wasm"];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(decoderFiles.map((filename) => (
  copyFile(resolve(decoderDirectory, filename), resolve(outputDirectory, filename))
)));
