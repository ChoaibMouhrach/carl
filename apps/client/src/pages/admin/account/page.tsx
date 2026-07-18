import {
  AdminPage,
  AdminPageContent,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CustomInput } from "@/components/custom-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Field, FieldLabel } from "@repo/ui/components/ui/field";
import { ChangePassword } from "@/components/change-password";
import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/admin-layout");

export const AdminAccountPage = () => {
  const { user } = route.useRouteContext();
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Account</AdminPageTitle>
        <AdminPageDescription>
          Manage your account settings.
        </AdminPageDescription>
      </AdminPageHeader>

      <AdminPageContent className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <CustomInput value={user.email} disabled />
            </Field>
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
      </AdminPageContent>
    </AdminPage>
  );
};
