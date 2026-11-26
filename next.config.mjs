/** Next config.
 *
 * The server modules are TypeScript with explicit `.ts` import specifiers, because Node's type-stripping
 * (used by the tests and the CLI scripts) requires them. Webpack resolves those literal paths fine, but
 * `extensionAlias` keeps the `.js`-style imports working too, so both entry points share one source tree.
 *
 * No Tailwind, no component library: the design is a token layer and plain CSS by choice (see DESIGN.md).
 */
import { fileURLToPath } from "node:url";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No webpack config: Next 16 builds with Turbopack by default, and Turbopack resolves the explicit `.ts`
  // import specifiers these modules use (the same specifiers Node's type-stripping needs for the tests and
  // the CLI scripts) without help. An extensionAlias shim was tried first and is not needed.
  // `root` is pinned so Turbopack does not walk up to a package-lock.json outside this repository.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};

export default nextConfig;
