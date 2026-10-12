export class HttpStatus {
  private constructor() {}
  static readonly OK = 200;
  static readonly CREATED = 201;
  static readonly ACCEPTED = 202;
  static readonly SEE_OTHER = 303;
  static readonly BAD_REQUEST = 400;
  static readonly FORBIDDEN = 403;
  static readonly NOT_FOUND = 404;
  static readonly CONFLICT = 409;
  static readonly PAYLOAD_TOO_LARGE = 413;
  static readonly INTERNAL_SERVER_ERROR = 500;
  static readonly SERVICE_UNAVAILABLE = 503;
}
