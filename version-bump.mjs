import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// Read and update manifest.json
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));

// Read and update or create versions.json
let versions;
try {
  versions = JSON.parse(readFileSync('versions.json', 'utf8'));
} catch {
  versions = {};
}

versions[targetVersion] = manifest.minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, 2));

console.log(`Updated version to ${targetVersion}`);