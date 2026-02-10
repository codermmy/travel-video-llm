export interface CameraState {
  target: {
    latitude: number;
    longitude: number;
  };
  zoom: number;
}

export interface MapViewStack {
  states: CameraState[];
  initialState: CameraState;
  currentIndex: number;
}
