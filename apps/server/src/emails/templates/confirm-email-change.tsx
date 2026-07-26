import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "../components/layout";

export interface ConfirmEmailChangeProps {
  newEmail: string;
  url: string;
  logoUrl?: string;
}

export const ConfirmEmailChange = ({
  newEmail,
  url = "https://example.com/confirm-email-change",
  logoUrl,
}: ConfirmEmailChangeProps) => (
  <EmailLayout preview="Confirm your email address change" logoUrl={logoUrl}>
    <Heading style={styles.heading}>Confirm your email change</Heading>
    <Text style={styles.paragraph}>
      Confirm that you want to change your email address to {newEmail}.
    </Text>
    <Button href={url} style={styles.button}>
      Confirm email change
    </Button>
    <Text style={styles.muted}>
      If you didn&apos;t request this change, you can safely ignore this email.
    </Text>
  </EmailLayout>
);

export default ConfirmEmailChange;
