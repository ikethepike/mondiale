export class GeneratorError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'GeneratorError'
  }
}

export class FetchError extends GeneratorError {
  constructor(message: string, public readonly url: string) {
    super(message, 'FETCH_ERROR')
    this.name = 'FetchError'
  }
}

export class ValidationError extends GeneratorError {
  constructor(message: string, public readonly data: unknown) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class FileSystemError extends GeneratorError {
  constructor(message: string, public readonly path: string) {
    super(message, 'FILE_SYSTEM_ERROR')
    this.name = 'FileSystemError'
  }
}

export class TransformationError extends GeneratorError {
  constructor(message: string, public readonly source: unknown) {
    super(message, 'TRANSFORMATION_ERROR')
    this.name = 'TransformationError'
  }
}
