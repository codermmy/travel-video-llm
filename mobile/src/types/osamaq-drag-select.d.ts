declare module '@osamaq/drag-select' {
  export interface Config<ListItem = unknown> {
    data: ListItem[];
    key: string;
    list: {
      animatedRef: any;
      numColumns?: number;
      numRows?: number;
      horizontal?: boolean;
      rowGap?: number;
      columnGap?: number;
      itemSize: {
        width: number;
        height: number;
      };
      contentInset?: {
        top?: number;
        bottom?: number;
        left?: number;
        right?: number;
      };
    };
    longPressGesture?: {
      enabled?: boolean;
      minDurationMs?: number;
    };
    panGesture?: {
      resetSelectionOnStart?: boolean;
      scrollEnabled?: boolean;
      scrollStartThreshold?: number;
      scrollEndThreshold?: number;
      scrollStartMaxVelocity?: number;
      scrollEndMaxVelocity?: number;
    };
    tapGesture?: {
      selectOnTapEnabled: boolean;
    };
    onItemPress?: (id: string, index: number) => void;
    onItemSelected?: (id: string, index: number) => void;
    onItemDeselected?: (id: string, index: number) => void;
  }

  export interface DragSelect {
    onScroll: (event: any) => void;
    gestures: {
      createItemPressHandler: (id: string, index: number) => any;
      panHandler: any;
    };
    selection: {
      add: (id: string) => void;
      clear: () => void;
      delete: (id: string) => void;
      has: (id: string) => boolean;
    };
  }

  export function useDragSelect<ListItem = unknown>(config: Config<ListItem>): DragSelect;
}
