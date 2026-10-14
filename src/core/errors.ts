export type DtErrorCode =
  | 'EMPTY_DATA'
  | 'BAD_PARAM'
  | 'CSV_PARSE'
  | 'CSV_LIMIT'
  | 'MISSING_VALUES'
  | 'SINGLE_CLASS'
  | 'TOO_FEW_PER_CLASS'
  | 'TIE_ORACLE'
  | 'CANCELLED'

export class DtError extends Error {
  code: DtErrorCode
  details?: Record<string, unknown>

  constructor(code: DtErrorCode, details?: Record<string, unknown>, message?: string) {
    super(message ?? code)
    this.name = 'DtError'
    this.code = code
    this.details = details
  }
}
