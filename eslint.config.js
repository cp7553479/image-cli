import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    files: ["src/**/*.ts"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": ["error", {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: false,
          MethodDefinition: false,
          ArrowFunctionExpression: false,
          FunctionExpression: false
        }
      }]
    }
  }
];
