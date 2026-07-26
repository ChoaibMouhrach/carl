import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { AuthLayout } from "@/pages/auth/layout";
import { SignInPage } from "@/pages/auth/sign-in/page";
import { SignUpPage } from "@/pages/auth/sign-up/page";
import { EmailVerifiedPage } from "@/pages/auth/email-verified/page";
import z from "zod";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password/page";
import { ResetPasswordPage } from "@/pages/auth/reset-password/page";
import { redirectIfAuthenticated } from "./middlewares";

const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  component: () => <AuthLayout />,
  id: "auth-layout",
  beforeLoad: () => redirectIfAuthenticated(),
});

export const signInRoute = createRoute({
  getParentRoute: () => authLayout,
  component: () => <SignInPage />,
  path: "/sign-in",
});

export const signUpRoute = createRoute({
  getParentRoute: () => authLayout,
  component: () => <SignUpPage />,
  path: "/sign-up",
});

export const emailVerifiedRoute = createRoute({
  getParentRoute: () => authLayout,
  component: () => <EmailVerifiedPage />,
  path: "/email-verified",
  validateSearch: z.object({
    email: z.email(),
  }),
});

export const forgotPasswordRoute = createRoute({
  getParentRoute: () => authLayout,
  component: () => <ForgotPasswordPage />,
  path: "/forgot-password",
});

export const resetPasswordRoute = createRoute({
  getParentRoute: () => authLayout,
  component: () => <ResetPasswordPage />,
  path: "/reset-password",
  validateSearch: z.object({ token: z.string().min(1) }),
});

export const authRouteTree = authLayout.addChildren([
  signInRoute,
  signUpRoute,
  emailVerifiedRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
]);
