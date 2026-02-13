const fs = require('fs');
const path = require('path');

// Prefer the nested web-ifc inside web-ifc-three (matched version), fallback to root
const nestedDir = path.join(__dirname, '..', 'node_modules', 'web-ifc-three', 'node_modules', 'web-ifc');
const rootDir = path.join(__dirname, '..', 'node_modules', 'web-ifc');
const wasmDir = fs.existsSync(nestedDir) ? nestedDir : rootDir;
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(wasmDir)) {
  console.log('web-ifc not installed yet, skipping WASM copy.');
  process.exit(0);
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const files = fs.readdirSync(wasmDir).filter(f => f.endsWith('.wasm'));
files.forEach(file => {
  fs.copyFileSync(
    path.join(wasmDir, file),
    path.join(publicDir, file)
  );
  console.log(`Copied ${file} to public/`);
});

console.log(`WASM setup complete (${files.length} file(s)).`);
