import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import AccountDisabledActions from "@/components/AccountDisabledActions";
import EdgeStateScreen from "@/components/EdgeStateScreen";

export const metadata: Metadata = {
  title: "Account disabled",
  robots: { index: false, follow: false },
};

export default function AccountDisabledPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";

  return (
    <EdgeStateScreen
      tone="warning"
      icon={<ShieldAlert className="h-6 w-6" aria-hidden="true" />}
      title="Your account is currently disabled"
      description="Access to this workspace has been paused. Contact support if you believe this was a mistake or need help restoring access."
      actions={<AccountDisabledActions supportEmail={supportEmail} />}
      footer={
        <p>
          Support email:{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-[var(--accent)] hover:underline">
            {supportEmail}
          </a>
        </p>
      }
    />
  );
}
