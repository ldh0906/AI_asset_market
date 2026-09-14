import { DemoMarket } from '../../../../components/demo-market';
export const metadata = { title: '상품 상세 데모 | AI 에셋마켓', robots: { index: false, follow: false } };
export default async function DemoProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemoMarket initialProductId={id} />;
}
