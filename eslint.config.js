module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          experimentalDecorators: true
        }
      },
      globals: {
        console: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly"
      }
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": "warn"
    }
  },
  {
    files: ["**/lwc/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          experimentalDecorators: true
        }
      }
    }
  },
  {
    files: ["**/aura/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script"
    }
  }
];
