/**
 * Error handling utilities
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class StreamDetectionError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'STREAM_DETECTION_ERROR', cause);
    this.name = 'StreamDetectionError';
  }
}

export class RecordingError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'RECORDING_ERROR', cause);
    this.name = 'RecordingError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIGURATION_ERROR', cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
