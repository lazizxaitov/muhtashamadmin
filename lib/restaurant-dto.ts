export type PublicRestaurantDTO = {
  id: number;
  name: string;
  address: string;
  description: string;
  status: string;
  image: string;
  logo: string;
  color: string;
  open: boolean;
  addedAt: string;
  workStart?: string;
  workEnd?: string;
  autoSchedule?: boolean;
};

export type AdminRestaurantDTO = PublicRestaurantDTO & {
  tokenPoster: string;
  spotId: string;
  integrationType: string;
  onecBaseUrl: string;
  onecAuthMethod: string;
  onecLogin: string;
  onecPassword: string;
  onecToken: string;
};
