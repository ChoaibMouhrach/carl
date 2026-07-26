import { Heading, Text } from "@react-email/components";
import { EmailLayout, styles } from "../components/layout";

export interface NotificationEmailProps {
  title: string;
  body: string;
  logoUrl?: string;
}

export const NotificationEmail = ({
  title = "You have a new notification",
  body = "Something new happened in your account.",
  logoUrl,
}: NotificationEmailProps) => (
  <EmailLayout preview={title} logoUrl={logoUrl}>
    <Heading style={styles.heading}>{title}</Heading>
    <Text style={styles.paragraph}>{body}</Text>
  </EmailLayout>
);

export default NotificationEmail;
