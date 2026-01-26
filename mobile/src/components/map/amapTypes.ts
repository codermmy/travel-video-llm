import type * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type CameraUpdate = {
  target?: LatLng;
  zoom?: number;
  tilt?: number;
  bearing?: number;
};

export type MapViewRef = {
  moveCamera: (update: CameraUpdate, duration?: number) => void;
};

export type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialCameraPosition?: {
    target: LatLng;
    zoom?: number;
  };
  onLoad?: () => void;
  onPress?: () => void;
  zoomControlsEnabled?: boolean;
  showsUserLocation?: boolean;
  children?: React.ReactNode;
};

export type MarkerProps = {
  position: LatLng;
  onPress?: () => void;
  zIndex?: number;
  children?: React.ReactNode;
};

export type AMapSdkApi = {
  init: (config?: { android?: string; ios?: string } | string) => void;
};

export type AMapModule = {
  MapView: unknown;
  Marker: unknown;
  AMapSdk: AMapSdkApi;
};
