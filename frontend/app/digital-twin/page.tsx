import { FactoryBuilderProvider } from "@/lib/factory-builder-context";
import { FactoryTwinPage } from "@/components/digital-twin/builder/FactoryTwinPage";
import { PageBack } from "@/components/page-back";

export default function DigitalTwinPage() {
  return (
    <>
      <PageBack />
      <FactoryBuilderProvider>
        <FactoryTwinPage />
      </FactoryBuilderProvider>
    </>
  );
}
