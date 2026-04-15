import js from "@eslint/js";
export default [
  js.configs.recommended,
  {
    rules: {
      "no-undef": "error"
    },
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        console: "readonly",
        process: "readonly",
        __dirname: "readonly"
      }
    }
  }
];
