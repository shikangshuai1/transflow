// Generate all required icon sizes from the source image
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconDir = join(__dirname, '..', 'public', 'icon');
const source = join(iconDir, 'source.png');

const sizes = [16, 32, 48, 96, 128];

for (const size of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(join(iconDir, `${size}.png`));
  console.log(`  ✅ ${size}.png`);
}
console.log('Icons generated!');
