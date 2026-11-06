const fs = require('node:fs');
const path = require('node:path');

// androidCompileApiLevel defaults to 36 and androidTargetApiLevel to 35.
// Gradle requires the compile platform installed; targetSdk opts the app into runtime changes.
const androidCompileApiLevel = Number(process.env.ANDROID_COMPILE_API_LEVEL || 36);
const androidTargetApiLevel = Number(process.env.ANDROID_TARGET_API_LEVEL || 35);
const buildFile = path.join(__dirname, '..', 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
let source = fs.readFileSync(buildFile, 'utf8');

for (const [setting, apiLevel] of [['compileSdk', androidCompileApiLevel], ['targetSdk', androidTargetApiLevel]]) {
  const property = new RegExp(`^(\\s*${setting}\\s*=\\s*)\\d+(\\s*)$`, 'm');
  if (!property.test(source)) throw new Error(`Could not find generated ${setting} setting in ${buildFile}`);
  source = source.replace(property, `$1${apiLevel}$2`);
}

fs.writeFileSync(buildFile, source);
