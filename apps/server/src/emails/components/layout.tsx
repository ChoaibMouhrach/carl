import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface EmailLayoutProps {
  preview: string;
  logoUrl?: string;
  children: ReactNode;
}

const main = {
  backgroundColor: "#f6f7f9",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #eaeaea",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "480px",
  overflow: "hidden",
};

const headerSection = { padding: "28px 32px 0" };
const contentSection = { padding: "12px 32px 8px" };
const footerSection = { padding: "0 32px 28px" };

const brand = {
  color: "#111827",
  fontSize: "17px",
  fontWeight: 600,
  margin: 0,
};

const logo = { display: "block" };

const divider = { borderColor: "#eaeaea", margin: "16px 0" };

const footerText = {
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};

export const styles: Record<
  "heading" | "paragraph" | "button" | "muted",
  CSSProperties
> = {
  heading: {
    color: "#111827",
    fontSize: "20px",
    fontWeight: 600,
    margin: "0 0 12px",
  },
  paragraph: {
    color: "#374151",
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "12px 20px",
    textDecoration: "none",
  },
  muted: {
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "20px 0 0",
  },
};

export const EmailLayout = ({
  preview,
  logoUrl,
  children,
}: EmailLayoutProps) => (
  <Html>
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          {logoUrl ? (
            <Img
              src={logoUrl}
              alt="SaaS Template"
              width="40"
              height="40"
              style={logo}
            />
          ) : (
            <Text style={brand}>SaaS Template</Text>
          )}
        </Section>
        <Section style={contentSection}>{children}</Section>
        <Hr style={divider} />
        <Section style={footerSection}>
          <Text style={footerText}>
            You received this email from SaaS Template. If it wasn&apos;t meant
            for you, you can safely ignore it.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);
