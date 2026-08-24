import { OrderScreen } from "@/components/screens/buyer/OrderScreen";
import { PaymentScreen } from "@/components/screens/buyer/PaymentScreen";

export const metadata = { title: "결제수단 선택 | FarmFi" };

// `.fig` B-05는 주문서 위에 뜨는 결제수단 패널이다. 뒤가 비어 있으면 무엇에
// 결제하는지가 화면에서 사라진다.
export default function Page() {
  return (
    <>
      <OrderScreen />
      <PaymentScreen />
    </>
  );
}
