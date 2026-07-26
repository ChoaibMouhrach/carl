import { Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "../components/layout";

export interface SignupAttemptProps {
  logoUrl?: string;
}

export const SignupAttempt = ({ logoUrl }: SignupAttemptProps) => (
  <EmailLayout
    preview="Someone tried to sign up with your email"
    logoUrl={logoUrl}
  >
    <Heading style={styles.heading}>Did you try to sign up?</Heading>
    <Text style={styles.paragraph}>
      Someone attempted to create an account with this email address. If it
      wasn&apos;t you, no action is required.
    </Text>
    <Text style={styles.paragraph}>
      If it was you, sign in or reset your password instead — an account already
      exists for this email.
    </Text>
  </EmailLayout>
);

export default SignupAttempt;
