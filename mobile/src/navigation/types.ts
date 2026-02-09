export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Main: undefined;
};

export type MainStackParamList = {
  Photos: undefined;
  Events: undefined;
  Settings: undefined;
  EventDetail: { eventId: string };
  PhotoViewer: { initialIndex?: number } | undefined;
  Slideshow: { eventId: string };
};
