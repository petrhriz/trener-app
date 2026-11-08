import { defineConfig } from "vitest/config";

// migrace (*.sql) se ve Workeru načítají jako text – v testech stejně
export default defineConfig({
  plugins: [{ name: "sql-text", transform: (code, id) => (id.endsWith(".sql") ? { code: `export default ${JSON.stringify(code)};`, map: null } : null) }],
});
