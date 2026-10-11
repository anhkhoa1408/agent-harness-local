export class DeliveryErrorCode {
  private constructor() {}
  static readonly PULL_REQUEST_COLLISION = "pull_request_collision" as const;
  static readonly DELIVERY_ERROR_REMOTE_NOT_GITHUB =
    "delivery_error:remote_not_github" as const;
}
