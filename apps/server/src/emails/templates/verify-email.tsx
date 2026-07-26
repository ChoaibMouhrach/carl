import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "../components/layout";

export interface VerifyEmailProps {
  url: string;
  logoUrl?: string;
}

export const VerifyEmail = ({
  url = "https://example.com/verify",
  logoUrl,
}: VerifyEmailProps) => (
  <EmailLayout preview="Verify your email address" logoUrl={logoUrl}>
    <Heading style={styles.heading}>Verify your email</Heading>
    <Text style={styles.paragraph}>
      Confirm your email address to finish setting up your account.
    </Text>
    <Button href={url} style={styles.button}>
      Verify email address
    </Button>
    <Text style={styles.muted}>
      If you didn&apos;t create an account, you can safely ignore this email.
    </Text>
  </EmailLayout>
);

export default VerifyEmail;
