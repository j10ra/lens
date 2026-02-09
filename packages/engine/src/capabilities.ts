export interface Capabilities {
  embedTexts?(texts: string[], isQuery?: boolean): Promise<number[][]>;
  generatePurpose?(path: string, content: string, exports: string[], docstring: string): Promise<string>;
}
