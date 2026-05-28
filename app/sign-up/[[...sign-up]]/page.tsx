import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <Link href="/" className="mb-8 focus-ring rounded-ctrl">
        <Wordmark size={22} />
      </Link>
      <SignUp />
    </div>
  );
}
