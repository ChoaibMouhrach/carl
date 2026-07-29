import Script from "next/script";

export const Umami = () => (
  <Script
    src={process.env.NEXT_PUBLIC_UMAMI_SRC}
    data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
    data-domains={process.env.NEXT_PUBLIC_UMAMI_DOMAINS}
    strategy="afterInteractive"
  />
);
