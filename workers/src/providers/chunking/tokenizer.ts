import { getEncoding, type TiktokenEncoding } from "js-tiktoken";

export interface Tokenizer {
  readonly name: string;
  countTokens(text: string): number;
}

export class TiktokenTokenizer implements Tokenizer {
  readonly name: string;
  private encoding: ReturnType<typeof getEncoding>;

  constructor(encodingName: TiktokenEncoding = "cl100k_base") {
    this.name = encodingName;
    this.encoding = getEncoding(encodingName);
  }

  countTokens(text: string): number {
    return this.encoding.encode(text).length;
  }
}
