// No market/product data source exists yet: there is no `/api/products` (or
// similar) route, and the Prisma schema (prisma/schema.prisma) has no
// Product model — only Project/Milestone/Transaction/etc. See
// docs/api-spec.md, which doesn't mention a market endpoint either.
// Kept as a curated static list; swap PRODUCTS for a real fetch once a
// market/products endpoint ships.
type Product = {
  name: string;
  desc: string;
  price: string;
};

const PRODUCTS: Product[] = [
  { name: "그로우팜 샐러드 믹스", desc: "150g | 무농약", price: "₩2,600" },
  { name: "방울토마토", desc: "500g | 무농약", price: "₩6,200" },
  { name: "허브온 성숙한 바질", desc: "50g | 무농약", price: "₩2,100" },
  { name: "그린스페이스 청경채", desc: "300g | 유기농", price: "₩2,100" },
  { name: "부산 센텀 로메인 상추", desc: "200g | 무농약", price: "₩1,900" },
];

export function MarketProducts() {
  return (
    <div className="market-grid">
      {PRODUCTS.map((product) => (
        <article className="card product-card" key={product.name}>
          <div className="thumb market" />
          <div className="product-body">
            <span className="badge">오늘 수확</span>
            <h3>{product.name}</h3>
            <p className="muted">{product.desc}</p>
            <p className="price">{product.price}</p>
            <button className="outline" style={{ width: "100%", marginTop: 14 }}>
              장바구니 담기
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
