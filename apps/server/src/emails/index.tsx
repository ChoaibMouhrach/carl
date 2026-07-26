import { render } from "@react-email/render";
import {
  ConfirmEmailChange,
  type ConfirmEmailChangeProps,
} from "./templates/confirm-email-change";
import {
  NotificationEmail,
  type NotificationEmailProps,
} from "./templates/notification";
import {
  ResetPassword,
  type ResetPasswordProps,
} from "./templates/reset-password";
import {
  SignupAttempt,
  type SignupAttemptProps,
} from "./templates/signup-attempt";
import { VerifyEmail, type VerifyEmailProps } from "./templates/verify-email";

export const renderVerifyEmail = (props: VerifyEmailProps) =>
  render(<VerifyEmail {...props} />);

export const renderConfirmEmailChange = (props: ConfirmEmailChangeProps) =>
  render(<ConfirmEmailChange {...props} />);

export const renderResetPassword = (props: ResetPasswordProps) =>
  render(<ResetPassword {...props} />);

export const renderSignupAttempt = (props: SignupAttemptProps) =>
  render(<SignupAttempt {...props} />);

export const renderNotification = (props: NotificationEmailProps) =>
  render(<NotificationEmail {...props} />);
