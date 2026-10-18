import { authClient } from "@/lib/auth-client";
import { isRedirect, redirect } from "@tanstack/react-router";

export const requireAuth = async () => {
  try {
    const session = await authClient.getSession();

    if (!session.data) {
      throw redirect({ to: "/sign-in" });
    }

    const { user } = session.data;

    return {
      user: {
        userId: user.id,
        email: user.email,
        role: user.role ?? "admin",
      },
    };
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    console.error(error);

    throw error;
  }
};

export const redirectIfAuthenticated = async () => {
  const session = await authClient.getSession();

  if (session.data) {
    throw redirect({ to: "/admin/dashboard" });
  }
};
