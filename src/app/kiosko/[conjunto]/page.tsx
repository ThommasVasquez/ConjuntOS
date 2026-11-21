import KioskoView from "@/components/kiosko/KioskoView";

export default async function KioskoConjuntoPage({
  params,
}: {
  params: Promise<{ conjunto: string }>;
}) {
  const { conjunto } = await params;
  return <KioskoView conjuntoSlug={conjunto} />;
}
