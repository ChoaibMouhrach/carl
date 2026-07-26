import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "../components/layout";

export interface ResetPasswordProps {
  url: string;
  logoUrl?: string;
}

export const ResetPassword = ({
  url = "https://example.com/reset-password",
  logoUrl,
}: ResetPasswordProps) => (
  <EmailLayout preview="Reset your password" logoUrl={logoUrl}>
    <Heading style={styles.heading}>Reset your password</Heading>
    <Text style={styles.paragraph}>
      We received a request to reset your password. Choose a new one using the
      button below.
    </Text>
    <Button href={url} style={styles.button}>
      Reset password
    </Button>
    <Text style={styles.muted}>
      If you didn&apos;t request this, no action is needed — your password
      won&apos;t change.
    </Text>
  </EmailLayout>
);

export default ResetPassword;
