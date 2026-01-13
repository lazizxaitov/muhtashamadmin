import RestaurantsGridMain from "./restaurants-grid-main";
import BannersGrid from "./banners-grid";
import SupportPhoneCard from "./support-phone-card";

export default function AdminPage() {
  return (
    <>
      <RestaurantsGridMain initialRestaurants={[]} />
      <BannersGrid />
      <SupportPhoneCard />
    </>
  );
}
