import { api } from "@/api";
import { authClient } from "@/lib/auth-client";
import { ApiError } from "@/lib/base-api";
import { isRedirect, redirect } from "@tanstack/react-router";

export const requireAuth = async (role?: "admin" | "user") => {
  try {
    const session = await authClient.getSession();

    if (!session.data) {
      throw redirect({ to: "/sign-in" });
    }

    if (role && session.data.user.role !== role) {
      throw redirect({
        to: "/error",
        search: {
          error: "Forbidden",
          description:
            "You do not have permission to access this resource. If you believe this is an error, please contact your administrator.",
        },
      });
    }

    const me = await api.auth.me();

    return me;
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    if (error instanceof ApiError && error.statusCode === 401) {
      throw redirect({
        to: "/sign-in",
      });
    }

    console.error(error);

    throw error;
  }
};

export const redirectIfAuthenticated = async () => {
  try {
    const session = await authClient.getSession();

    if (!session.data) {
      return;
    }

    throw redirect({ to: "/dashboard" });
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    if (error instanceof ApiError && error.statusCode === 401) {
      return;
    }

    throw error;
  }
};

export const redirectToRoleDashboard = async () => {
  const me = await requireAuth();

  throw redirect({
    to: me.user.role === "admin" ? "/admin/dashboard" : "/user/dashboard",
  });
};

export const requireOnboarded = (me: { needsOnboarding: boolean }) => {
  if (me.needsOnboarding) {
    throw redirect({ to: "/user/select-plan" });
  }
};

export const requireNotOnboarded = (me: { needsOnboarding: boolean }) => {
  if (!me.needsOnboarding) {
    throw redirect({ to: "/user/dashboard" });
  }
};
