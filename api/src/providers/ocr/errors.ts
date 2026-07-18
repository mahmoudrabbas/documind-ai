export class OcrProviderError extends Error {
  readonly provider: string;
  readonly cause?: Error;

  constructor(message: string, provider: string, cause?: Error) {
    super(message);
    this.name = "OcrProviderError";
    this.provider = provider;
    this.cause = cause;
  }
}

export class ProviderTimeoutError extends OcrProviderError {
  readonly timeoutMs: number;

  constructor(provider: string, timeoutMs: number, cause?: Error) {
    super(`OCR provider '${provider}' timed out after ${timeoutMs}ms`, provider, cause);
    this.name = "ProviderTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class UnsupportedLanguageError extends OcrProviderError {
  readonly language: string;

  constructor(provider: string, language: string) {
    super(`OCR provider '${provider}' does not support language '${language}'`, provider);
    this.name = "UnsupportedLanguageError";
    this.language = language;
  }
}

export class OcrAuthenticationError extends OcrProviderError {
  constructor(provider: string, message = "Authentication failed with OCR provider") {
    super(message, provider);
    this.name = "OcrAuthenticationError";
  }
}

export class OcrQuotaExceededError extends OcrProviderError {
  constructor(provider: string, message = "OCR quota exceeded") {
    super(message, provider);
    this.name = "OcrQuotaExceededError";
  }
}

export class PartialPageFailureError extends OcrProviderError {
  readonly failedPages: number[];
  readonly succeededPages: number[];

  constructor(provider: string, failedPages: number[], succeededPages: number[]) {
    super(
      `OCR partial failure: ${failedPages.length} page(s) failed [${failedPages.join(", ")}], ${succeededPages.length} succeeded`,
      provider,
    );
    this.name = "PartialPageFailureError";
    this.failedPages = failedPages;
    this.succeededPages = succeededPages;
  }
}
