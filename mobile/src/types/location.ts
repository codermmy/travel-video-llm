export type LocationCityCandidate = {
  name: string;
  displayName: string;
  adcode: string;
};

export type LocationPlaceCandidate = {
  name: string;
  address: string;
  locationName: string;
  detailedLocation: string;
  locationTags: string;
  gpsLat: number;
  gpsLon: number;
};
