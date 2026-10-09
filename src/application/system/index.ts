export type LoginState = {
  status:
    | "signed_out"
    | "starting"
    | "waiting"
    | "authenticated"
    | "error"
    | "unavailable";
  authorizationUrl: string | null;
  error: string | null;
};
export interface LoginService {
  status(): Promise<LoginState>;
  start(): Promise<LoginState>;
  cancel(): Promise<LoginState>;
}
export class SystemService {
  constructor(
    private readonly login: LoginService,
    private readonly picker: () => Promise<string | null>,
    private readonly catalog: () => Promise<
      import("../../domain/model-policy").ModelInfo[]
    >,
  ) {}
  loginStatus() {
    return this.login.status();
  }
  startLogin() {
    return this.login.start();
  }
  cancelLogin() {
    return this.login.cancel();
  }
  pickFolder() {
    return this.picker();
  }
  models() {
    return this.catalog();
  }
}
