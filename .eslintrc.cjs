module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: ["eslint:recommended"],
  ignorePatterns: ["dist/", "node_modules/"],
  rules: {
    "no-empty": "off",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
