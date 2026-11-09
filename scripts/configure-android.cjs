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

// Signing (Tauri v2 reads keystore.properties + signingConfigs in build.gradle.kts).
// Local/CI export TAURI_ANDROID_KEYSTORE_PATH + KEYSTORE_PASSWORD + KEY_ALIAS + KEY_PASSWORD;
// the script writes the private properties file and idempotently patches Gradle.
const signingPath = process.env.TAURI_ANDROID_KEYSTORE_PATH || '';
const signingAlias = process.env.TAURI_ANDROID_KEY_ALIAS || process.env.ANDROID_KEY_ALIAS || '';
const signingStorePass = process.env.TAURI_ANDROID_KEYSTORE_PASSWORD || process.env.KEYSTORE_PASSWORD || process.env.TAURI_ANDROID_KEY_PASSWORD || process.env.ANDROID_KEY_PASSWORD || '';
if (signingPath) {
  if (!signingAlias) throw new Error('TAURI_ANDROID_KEY_ALIAS is required when TAURI_ANDROID_KEYSTORE_PATH is set');
  if (!signingStorePass) throw new Error('TAURI_ANDROID_KEYSTORE_PASSWORD (or TAURI_ANDROID_KEY_PASSWORD) is required when TAURI_ANDROID_KEYSTORE_PATH is set');
  const androidDir = path.join(__dirname, '..', 'src-tauri', 'gen', 'android');
  fs.writeFileSync(path.join(androidDir, 'keystore.properties'), `keyAlias=${signingAlias}\npassword=${signingStorePass}\nstoreFile=${signingPath}\n`);
  if (!source.includes('java.io.FileInputStream')) {
    source = source.replace('import java.util.Properties', 'import java.io.FileInputStream\nimport java.util.Properties');
  }
  if (!source.includes('signingConfigs')) {
    const signingBlock = `    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
`;
    if (!/buildTypes\s*\{/.test(source)) throw new Error('Could not find buildTypes in generated build.gradle.kts');
    source = source.replace(/    buildTypes\s*\{/, `${signingBlock}    buildTypes {`);
  }
  if (!source.includes('signingConfig = signingConfigs.getByName("release")')) {
    source = source.replace(/getByName\("release"\)\s*\{/, 'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")');
  }
}

fs.writeFileSync(buildFile, source);
