import { memo, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { EventPhotoItem } from '@/types/event';
import { getPhotoThumbnailCandidates } from '@/utils/mediaRefs';

type PhotoGridProps = {
  photos: EventPhotoItem[];
  onPhotoPress?: (photo: EventPhotoItem, index: number) => void;
  emptyText?: string;
  selectedPhotoId?: string | null;
};

const COLUMNS = 3;
const GAP = 4;

function PhotoCard(props: {
  photo: EventPhotoItem;
  index: number;
  size: number;
  onPress?: (photo: EventPhotoItem, index: number) => void;
  selectedPhotoId?: string | null;
}) {
  const [failedCandidateIndex, setFailedCandidateIndex] = useState(0);
  const uriCandidates = getPhotoThumbnailCandidates(props.photo);
  const uri = uriCandidates[failedCandidateIndex] ?? null;

  return (
    <Pressable
      onPress={() => props.onPress?.(props.photo, props.index)}
      style={({ pressed }) => [
        styles.cell,
        {
          width: props.size,
          height: props.size,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          onError={() => {
            setFailedCandidateIndex((prev) => prev + 1);
          }}
        />
      ) : (
        <View style={styles.placeholder}>
          <MaterialCommunityIcons name="image-off-outline" size={18} color="#8090B2" />
          <Text style={styles.placeholderText}>不可用</Text>
        </View>
      )}
      {props.photo.id === props.selectedPhotoId ? (
        <View style={styles.selectedBadge}>
          <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
}

function PhotoGridBase({
  photos,
  onPhotoPress,
  emptyText = '暂无照片',
  selectedPhotoId = null,
}: PhotoGridProps) {
  const { width } = useWindowDimensions();
  const size = useMemo(() => {
    const horizontalPadding = 32;
    const available = width - horizontalPadding - GAP * (COLUMNS - 1);
    return Math.max(72, Math.floor(available / COLUMNS));
  }, [width]);

  if (photos.length === 0) {
    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="image-outline" size={22} color="#8A97B8" />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={photos}
      keyExtractor={(item) => item.id}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      renderItem={({ item, index }) => (
        <PhotoCard
          photo={item}
          index={index}
          size={size}
          onPress={onPhotoPress}
          selectedPhotoId={selectedPhotoId}
        />
      )}
      removeClippedSubviews
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      scrollEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: GAP,
    gap: GAP,
  },
  cell: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EAF0FF',
    borderWidth: 1,
    borderColor: '#DCE5FA',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2FF',
  },
  placeholderText: {
    marginTop: 6,
    fontSize: 10,
    color: '#6C7C9D',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31, 72, 172, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DEE7FA',
    backgroundColor: '#F6F8FF',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 12,
    color: '#7A89A9',
  },
});

export const PhotoGrid = memo(PhotoGridBase);
