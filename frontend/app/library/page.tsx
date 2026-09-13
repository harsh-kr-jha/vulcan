import type { Metadata } from "next";

import { DigitalLibrary } from "@/components/digital-library";

export const metadata: Metadata = { title: "Regina | Technical Library" };

export default function DigitalLibraryPage() {
  return <DigitalLibrary />;
}
