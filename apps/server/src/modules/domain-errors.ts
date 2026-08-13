export class ResourceNotFoundError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}

export class RevisionConflictError<T> extends Error {
  public constructor(public readonly current: T) {
    super('数据已被其他操作修改');
    this.name = 'RevisionConflictError';
  }
}

export class DomainValidationError extends Error {
  public constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

export class ExternalServiceError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

export class DomainConflictError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainConflictError';
  }
}
