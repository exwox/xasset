import { cp, mkdir } from "node:fs/promises";

await mkdir("public/cesium", { recursive: true });
for (const [source, target] of [
  ["node_modules/@cesium/engine/Build/Workers", "public/cesium/Workers"],
  ["node_modules/@cesium/engine/Source/Assets", "public/cesium/Assets"],
  ["node_modules/@cesium/engine/Source/ThirdParty", "public/cesium/ThirdParty"],
  ["node_modules/@cesium/widgets/Source", "public/cesium/Widgets"],
]) await cp(source, target, { recursive: true, force: true });
