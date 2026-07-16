const esbuild = require('esbuild');
const path = require('path');

async function build() {
  const isProd = process.env.NODE_ENV === 'production';
  
  // Build main.ts
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/main/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: path.join(__dirname, '../dist/main/main.js'),
    external: ['electron', '@prisma/client'],
    minify: isProd,
    sourcemap: !isProd,
  });

  // Build preload.ts
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/main/preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: path.join(__dirname, '../dist/preload/preload.js'),
    external: ['electron'],
    minify: isProd,
    sourcemap: !isProd,
  });

  console.log('Main and Preload processes built successfully.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
