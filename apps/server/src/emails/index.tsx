import { render } from "@react-email/render";
import {
  ConfirmEmailChange,
  type ConfirmEmailChangeProps,
} from "./templates/confirm-email-change";
import {
  ResetPassword,
  type ResetPasswordProps,
} from "./templates/reset-password";
import { VerifyEmail, type VerifyEmailProps } from "./templates/verify-email";

export const renderVerifyEmail = (props: VerifyEmailProps) =>
  render(<VerifyEmail {...props} />);

export const renderConfirmEmailChange = (props: ConfirmEmailChangeProps) =>
  render(<ConfirmEmailChange {...props} />);

export const renderResetPassword = (props: ResetPasswordProps) =>
  render(<ResetPassword {...props} />);
