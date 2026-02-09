declare module 'react-native-amap3d' {
  import * as React from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';

  export type LatLng = {
    latitude: number;
    longitude: number;
  };

  export type CameraPosition = {
    target: LatLng;
    zoom?: number;
    tilt?: number;
    bearing?: number;
  };

  export type CameraUpdate = Partial<CameraPosition>;

  export interface MapViewProps {
    style?: StyleProp<ViewStyle>;
    initialCameraPosition?: CameraPosition;
    onLoad?: () => void;
    onPress?: () => void;
    zoomControlsEnabled?: boolean;
    showsUserLocation?: boolean;
    children?: React.ReactNode;
  }

  export class MapView extends React.Component<MapViewProps> {
    moveCamera(update: CameraUpdate, duration?: number): void;
  }

  export interface MarkerProps {
    position: LatLng;
    onPress?: () => void;
    zIndex?: number;
    children?: React.ReactNode;
  }

  export class Marker extends React.Component<MarkerProps> {}

  export const AMapSdk: {
    init(config?: { android?: string; ios?: string } | string): void;
  };
}
