import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";

export const UserDashboardPage = () => {
  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>Start with your product.</UserPageTitle>
        <UserPageDescription>
          Your SaaS foundation is ready. Add a focused domain module when you
          know what your customers need.
        </UserPageDescription>
      </UserPageHeader>
      <UserPageContent></UserPageContent>
    </UserPage>
  );
};
