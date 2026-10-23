// Route `import 'playwright'` to the stub that cannot launch.
import { register } from 'node:module';
const stub = new URL('./playwright-stub.mjs', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, next) {
     return s === 'playwright' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(s, c);
   }`));
