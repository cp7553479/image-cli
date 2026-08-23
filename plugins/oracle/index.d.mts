/** Type surface consumed by test/plugins/oracle-plugin.test.ts. */

export declare function parseOracleModel(modelId: string): {
  oracleModel: string;
  thinkingTime: string | undefined;
};

export declare function resolveGeminiAspect(
  oracleModel: string,
  size: string | undefined
): string | undefined;
