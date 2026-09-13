export interface LibraryStandardSummary {
  code: string;
  designation: string;
  title: string;
  edition: string;
  scope: string;
  counts: { sections: number; materials: number; ratings: number; dimensions: number };
}

export interface LibrarySection {
  id: string;
  code: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  source_reference: string;
}

export interface LibraryMaterial {
  id: string;
  group: string;
  designation: string;
  specification: string;
  grade: string;
  name: string;
  productForm: string;
  ratingTable: string;
  restrictions: string[];
  sourceReference: string;
}

export interface LibraryComponentType {
  id: string;
  code: string;
  name: string;
  description: string;
  applicable_classes: number[];
  facing_types: string[];
  source_reference: string;
}

export interface LibraryCatalog {
  standard: {
    id: string;
    code: string;
    designation: string;
    title: string;
    edition: string;
    publisher: string;
    scope: string;
    metadata: { pressureClasses: number[]; unitSystems: string[] };
  };
  sections: LibrarySection[];
  components: LibraryComponentType[];
  materials: LibraryMaterial[];
  counts: { sections: number; components: number; materials: number; ratings: number; dimensions: number; figures: number };
}

export interface LibrarySearchResult {
  type: string;
  title: string;
  subtitle: string;
  reference: string;
  target: Record<string, string | number>;
}

export interface RatingOptions {
  materialGroups: string[];
  materials: LibraryMaterial[];
  pressureClasses: number[];
  temperaturesC: { value: number; label: string }[];
}

export interface RatingResult {
  material: LibraryMaterial;
  pressureClass: number;
  temperature: number;
  temperatureUnit: string;
  maximumAllowablePressure: number;
  pressureUnit: string;
  notes: string[];
  source: { standard: string; reference: string; table: string };
}

export interface DimensionOptions {
  components: { code: string; name: string }[];
  pressureClasses: number[];
  sizes: { value: number; label: string }[];
  facingTypes: string[];
}

export interface DimensionField {
  key: string;
  label: string;
  symbol: string;
  value: string | number;
  unit: string;
}

export interface DimensionResult {
  component: { code: string; name: string; description: string };
  pressureClass: number;
  nps: string;
  facingType: string;
  unitSystem: string;
  fields: DimensionField[];
  tolerances: Record<string, string>;
  notes: string[];
  figure: null | {
    id: string;
    code: string;
    title: string;
    diagramKind: string;
    dimensionLabels: string[];
    description: string;
    sourceReference: string;
  };
  source: { standard: string; reference: string };
}
