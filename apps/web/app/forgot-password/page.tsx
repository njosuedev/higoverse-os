import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import LoginScreen from "../login/LoginScreen";

const description =
  "Forgot your Higoverse password? Enter your account email to get a 6-digit code and set a new password.";

export const metadata: Metadata = {
  title: "Forgot Password",
  description,
  alternates: { canonical: `${SITE.url}/forgot-password` },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `Forgot Password | ${SITE.name}`,
    description,
    url: "/forgot-password",
    locale: SITE.locale,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name} · ${SITE.shortTitle}` }],
  },
};

/** The sign-in screen opened on the reset-password step. */
export default function ForgotPasswordPage() {
  return (
    <div className="auth-page">
      <LoginScreen initialStep="forgot" />
    </div>
  );
}
