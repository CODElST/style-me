#!/usr/bin/env node
/**
 * Windows long-path fix for local `npx expo run:android` builds (dev machines only).
 *
 * Problem: RN autolinking configures native codegen CMake targets with source
 * paths so deep that ninja (any version) fails to mkdir them once the absolute
 * path exceeds the 260-char MAX_PATH limit:
 *
 *   ninja: error: mkdir(...): No such file or directory
 *
 * Fix: shorten the two offending source trees with NTFS junctions and point
 * the packages' CMake globs at the junctions instead. Also note the SDK's
 * bundled cmake/ninja swap (documented in README; not done here since it
 * touches files outside this repo).
 *
 * Run after every fresh `npm install` on Windows:
 *
 *   node scripts/fix-windows-longpaths.js
 *
 * Idempotent: skips junctions/edits that already exist.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

if (!isWindows) {
  console.log('Windows only — nothing to do.');
  process.exit(0);
}

/** Create a directory junction, skipping if one already exists at `linkPath`. */
function ensureJunction(linkPath, targetPath, label) {
  const exists = fs.existsSync(linkPath) || fs.existsSync(path.join(linkPath, '.'));
  if (exists) {
    console.log(`[ok] junction already present: ${label}`);
    return;
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  // Junctions tolerate relative targets; use absolute to be unambiguous.
  fs.symlinkSync(path.resolve(targetPath), linkPath, 'junction');
  if (!fs.existsSync(path.join(linkPath, '.'))) {
    throw new Error(`junction did not resolve: ${label} -> ${targetPath}`);
  }
  console.log(`[ok] junction created: ${label}\n     -> ${path.resolve(targetPath)}`);
}

/** Replace `oldText` with `newText` in a CMakeLists once; no-op if already applied. */
function patchFile(file, oldText, newText, label) {
  if (!fs.existsSync(file)) {
    console.warn(`[skip] ${label}: ${path.relative(root, file)} not found (stale node_modules?)`);
    return;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(newText)) {
    console.log(`[ok] already patched: ${label}`);
    return;
  }
  if (!src.includes(oldText)) {
    console.warn(`[skip] ${label}: expected text not found (package updated? re-check)`);
    return;
  }
  fs.writeFileSync(file, src.replace(oldText, newText), 'utf8');
  console.log(`[ok] patched: ${label}`);
}

// --- 1. react-native-gesture-handler -----------------------------------------
// Junction: shared/sn -> shared/shadowNodes/react/renderer/components
// (glob routes through the junction; the include dir stays on the original
// path so the generated header prefix `react/renderer/components/...` is kept)
const rngh = path.join(root, 'node_modules', 'react-native-gesture-handler');
if (fs.existsSync(rngh)) {
  ensureJunction(
    path.join(rngh, 'shared', 'sn'),
    path.join(rngh, 'shared', 'shadowNodes', 'react', 'renderer', 'components'),
    'rngh shared/sn',
  );
  patchFile(
    path.join(rngh, 'android', 'CMakeLists.txt'),
    'CONFIGURE_DEPENDS ../shared/shadowNodes/react/renderer/components/*.cpp)',
    'CONFIGURE_DEPENDS ../shared/sn/*.cpp)',
    'rngh source glob -> ../shared/sn',
  );
} else {
  console.warn('[skip] react-native-gesture-handler not installed');
}

// --- 2. react-native-safe-area-context --------------------------------------
// Junction: cj -> android/build/generated/source/codegen/jni
// (that deep codegen path is where ninja's mkdir used to explode)
const sac = path.join(root, 'node_modules', 'react-native-safe-area-context');
if (fs.existsSync(sac)) {
  ensureJunction(
    path.join(sac, 'cj'),
    path.join(sac, 'android', 'build', 'generated', 'source', 'codegen', 'jni'),
    'safe-area-context cj',
  );
  patchFile(
    path.join(sac, 'android', 'src', 'main', 'jni', 'CMakeLists.txt'),
    'set(LIB_ANDROID_GENERATED_JNI_DIR ${LIB_ANDROID_DIR}/build/generated/source/codegen/jni)',
    'set(LIB_ANDROID_GENERATED_JNI_DIR ${LIB_ANDROID_DIR}/../cj)',
    'safe-area-context JNI dir -> ../cj',
  );
} else {
  console.warn('[skip] react-native-safe-area-context not installed');
}

console.log('\nDone. Native build notes:');
console.log('- If android/app/.cxx exists from an earlier failed build, delete it before rebuilding:');
console.log('    node -e "fs.rmSync(\'android/app/.cxx\',{recursive:true,force:true})"');
console.log('- The SDK-bundled ninja also needs to be 1.13.1+ (see README "Windows long paths").');
