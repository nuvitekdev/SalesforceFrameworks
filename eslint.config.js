const { configs } = require("@salesforce/eslint-config-lwc");

module.exports = [
  ...configs.lwc.map((config) => ({
    ...config,
    files: ["**/lwc/**/*.js"]
  })),
  {
    files: ["**/aura/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        console: "readonly",
        window: "readonly",
        document: "readonly"
      }
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": "warn"
    }
  }
];
