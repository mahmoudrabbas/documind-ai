export class SBGError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options: { statusCode?: number; retryable?: boolean; cause?: Error } = {}
  ) {
    super(message);
    this.name = "SBGError";
    this.code = code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export class SBGAuthError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "AUTH_ERROR", { statusCode: 401, retryable: false, cause });
    this.name = "SBGAuthError";
  }
}

export class SBGRateLimitError extends SBGError {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, cause?: Error) {
    super(message, "RATE_LIMIT_ERROR", { statusCode: 429, retryable: true, cause });
    this.name = "SBGRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class SBGTimeoutError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "TIMEOUT_ERROR", { statusCode: 408, retryable: true, cause });
    this.name = "SBGTimeoutError";
  }
}

export class SBGModelUnavailableError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "MODEL_UNAVAILABLE", { statusCode: 400, retryable: false, cause });
    this.name = "SBGModelUnavailableError";
  }
}

export class SBGNetworkError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR", { retryable: true, cause });
    this.name = "SBGNetworkError";
  }
}

export class SBGServiceUnavailableError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "SERVICE_UNAVAILABLE", { statusCode: 503, retryable: true, cause });
    this.name = "SBGServiceUnavailableError";
  }
}

export class SBGQuotaExceededError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "QUOTA_EXCEEDED", { statusCode: 402, retryable: false, cause });
    this.name = "SBGQuotaExceededError";
  }
}

export class SBGValidationError extends SBGError {
  constructor(message: string, cause?: Error) {
    super(message, "VALIDATION_ERROR", { statusCode: 400, retryable: false, cause });
    this.name = "SBGValidationError";
  }
}

export function classifySBGError(error: unknown): SBGError {
  if (error instanceof SBGError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes("unauthorized") || message.includes("401") || message.includes("invalid api key")) {
      return new SBGAuthError(error.message, error);
    }
    if (message.includes("rate limit") || message.includes("429") || message.includes("too many requests")) {
      return new SBGRateLimitError(error.message, undefined, error);
    }
    if (message.includes("timeout") || message.includes("etimedout") || message.includes("408")) {
      return new SBGTimeoutError(error.message, error);
    }
    if (message.includes("model not found") || message.includes("model unavailable") || message.includes("invalid model")) {
      return new SBGModelUnavailableError(error.message, error);
    }
    if (message.includes("service unavailable") || message.includes("503")) {
      return new SBGServiceUnavailableError(error.message, error);
    }
    if (message.includes("quota") || message.includes("402")) {
      return new SBGQuotaExceededError(error.message, error);
    }
    if (message.includes("network") || message.includes("econnrefused") || message.includes("enotfound")) {
      return new SBGNetworkError(error.message, error);
    }
    if (message.includes("400") || message.includes("bad request")) {
      return new SBGValidationError(error.message, error);
    }
    return new SBGError(
      error.message,
      "UNKNOWN_ERROR",
      { retryable: message.includes("500") || message.includes("502") || message.includes("504"), cause: error }
    );
  }

  return new SBGError(String(error), "UNKNOWN_ERROR", { retryable: false });
}

export function isRetryableError(error: unknown): boolean {
  const sbgError = classifySBGError(error);
  return sbgError.retryable;
}