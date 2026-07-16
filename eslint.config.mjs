import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma client di-generate, bukan kode tangan:
    "src/generated/**",
  ]),
  {
    rules: {
      // App ini client-side (single-user, lokal): pola "fetch-on-mount lalu setState"
      // dipakai konsisten di semua halaman. Rule ini menandainya sebagai error (bahkan
      // untuk setState setelah await); turunkan ke warning agar tetap terlihat tanpa
      // memblokir lint. Ganti ke server component / data library kalau app tumbuh besar.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
