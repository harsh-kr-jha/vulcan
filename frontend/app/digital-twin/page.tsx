import { FactoryBuilderProvider } from "@/lib/factory-builder-context";
import { FactoryTwinPage } from "@/components/digital-twin/builder/FactoryTwinPage";

export default function DigitalTwinPage() {
  return (
    <div className="page-full-bleed">
      <FactoryBuilderProvider>
        <FactoryTwinPage />
      </FactoryBuilderProvider>
    </div>
  );
}
