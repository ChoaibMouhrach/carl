import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { ChangePassword } from "@/components/change-password";
import { getRouteApi } from "@tanstack/react-router";
import { AgentAccess } from "./agent-access";
import { ChangeEmail } from "./change-email";
import { Passkeys } from "./passkeys";
import { SessionManagement } from "./session-management";

const route = getRouteApi("/admin-layout");

export const Account = () => {
  const { user } = route.useRouteContext();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmail email={user.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePassword />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passkeys</CardTitle>
          <CardDescription>
            Sign in with your fingerprint, face or a security key instead of a
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Passkeys />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions and devices</CardTitle>
          <CardDescription>
            Review where you are signed in and end access you no longer need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionManagement />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent access</CardTitle>
          <CardDescription>
            Connect an AI agent so it can look Skool up through Carl. Nothing it
            finds is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentAccess />
        </CardContent>
      </Card>
    </>
  );
};
