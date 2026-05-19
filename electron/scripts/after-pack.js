const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName;

  let resourcesDir;
  if (platform === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(appOutDir, `${appName}.app`, "Contents", "Resources");
  } else {
    resourcesDir = path.join(appOutDir, "resources");
  }

  const appContentDir = path.join(resourcesDir, "app-content");
  fs.mkdirSync(appContentDir, { recursive: true });

  const bundleDir = path.join(__dirname, "..", ".app-bundle");

  // Copy server bundle
  fs.copyFileSync(
    path.join(bundleDir, "server-bundle.cjs"),
    path.join(appContentDir, "server-bundle.cjs")
  );

  // Copy production server launcher
  fs.copyFileSync(
    path.join(bundleDir, "app-server.cjs"),
    path.join(appContentDir, "app-server.cjs")
  );

  // Copy frontend dist
  const srcDist = path.join(bundleDir, "frontend-dist");
  const destDist = path.join(appContentDir, "frontend-dist");
  fs.cpSync(srcDist, destDist, { recursive: true });

  // Copy playlens-runtime hooks
  const runtimeSrc = path.join(__dirname, "..", "..", "playlens-runtime");
  const runtimeDest = path.join(appContentDir, "playlens-runtime");
  if (fs.existsSync(runtimeSrc)) {
    fs.cpSync(runtimeSrc, runtimeDest, { recursive: true });
  }

  console.log(`[after-pack] Copied app-content to ${appContentDir}`);
};
