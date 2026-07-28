import { UploadManager } from "@/components/upload-manager";
import { getUploads } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  return <UploadManager initialUploads={await getUploads()} />;
}
