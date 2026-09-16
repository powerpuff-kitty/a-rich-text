import { createRequire } from 'node:module';
import { run } from 'vue-tsc';
const require = createRequire(import.meta.url);
// vue-tsc needs the JavaScript compiler API; editor packages keep TypeScript 7.
process.argv = [process.argv[0], process.argv[1], '--project', 'examples/vue/tsconfig.json', '--noEmit'];
run(require.resolve('@typescript/typescript6/lib/tsc'));
